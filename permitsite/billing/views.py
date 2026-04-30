from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.shortcuts import render, get_object_or_404
from django.http import HttpResponse
from .models import Invoice
from permits.pdf import render_invoice_pdf


@login_required
def invoice_list(request):
    invoices = Invoice.objects.filter(client=request.user).order_by("-issued_at")
    return render(request, "billing/list.html", {"invoices": invoices})


@login_required
def invoice_detail(request, pk):
    inv = get_object_or_404(Invoice, pk=pk, client=request.user)
    return render(request, "billing/detail.html", {"inv": inv})


@login_required
def invoice_pdf(request, pk):
    inv = get_object_or_404(Invoice, pk=pk, client=request.user)
    pdf = render_invoice_pdf(inv)
    resp = HttpResponse(pdf, content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="{inv.number}.pdf"'
    return resp


# --- PayFast integration ---
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_http_methods
from django.shortcuts import redirect, render
from django.conf import settings
from django.utils import timezone
from . import payfast


@login_required
def pay_start(request, pk):
    inv = get_object_or_404(Invoice, pk=pk, client=request.user)
    if inv.status == "paid":
        return redirect("billing_detail", pk=inv.pk)
    fields = payfast.build_form_fields(inv, request, settings)
    return render(request, "billing/payfast_redirect.html", {
        "inv": inv,
        "fields": fields,
        "endpoint": payfast.endpoint(settings),
    })


@login_required
def pay_return(request, pk):
    inv = get_object_or_404(Invoice, pk=pk, client=request.user)
    return render(request, "billing/payfast_return.html", {"inv": inv})


@login_required
def pay_cancel(request, pk):
    inv = get_object_or_404(Invoice, pk=pk, client=request.user)
    return render(request, "billing/payfast_cancel.html", {"inv": inv})


@csrf_exempt
@require_POST
def payfast_notify(request):
    """ITN endpoint - server-to-server from PayFast.

    Verifies signature, amount, and marks invoice paid + app 'approved'.
    For real production also verify source IP against PayFast's IP list + call
    back to PayFast validate endpoint.
    """
    data = {k: v for k, v in request.POST.items()}
    if not payfast.verify_itn(data, settings):
        return HttpResponse("BAD SIGNATURE", status=400)

    m_payment_id = data.get("m_payment_id", "")
    amount_gross = data.get("amount_gross", "")
    payment_status = data.get("payment_status", "")

    try:
        inv = Invoice.objects.get(number=m_payment_id)
    except Invoice.DoesNotExist:
        return HttpResponse("UNKNOWN INVOICE", status=404)

    # Verify amount matches
    try:
        if abs(float(amount_gross) - float(inv.total)) > 0.01:
            return HttpResponse("AMOUNT MISMATCH", status=400)
    except ValueError:
        return HttpResponse("BAD AMOUNT", status=400)

    if payment_status == "COMPLETE":
        if inv.status != "paid":
            inv.status = "paid"
            inv.paid_at = timezone.now()
            inv.save()
            # move permit application forward
            app = inv.application
            if app.status in ("draft", "submitted"):
                app.status = "approved"
                app.save()
    return HttpResponse("OK")


# Manual simulate (dev only): posts a fake COMPLETE ITN to the notify endpoint.
@login_required
def pay_simulate_success(request, pk):
    """Dev-only: mark paid directly without going to PayFast sandbox. Useful when offline."""
    if not settings.DEBUG:
        return HttpResponse("Only available in DEBUG mode", status=403)
    inv = get_object_or_404(Invoice, pk=pk, client=request.user)
    if inv.status != "paid":
        inv.status = "paid"
        inv.paid_at = timezone.now()
        inv.save()
        app = inv.application
        if app.status in ("draft", "submitted"):
            app.status = "approved"
            app.save()
    messages.success(request, f"[Simulated] Invoice {inv.number} marked paid.")
    return redirect("billing_detail", pk=inv.pk)
