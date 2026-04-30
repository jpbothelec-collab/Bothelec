from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from .forms import SignupForm


def signup(request):
    if request.method == "POST":
        form = SignupForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("dashboard")
    else:
        form = SignupForm()
    return render(request, "accounts/signup.html", {"form": form})


@login_required
def dashboard(request):
    from permits.models import PermitApplication
    from fleet.models import Vehicle
    from billing.models import Invoice
    context = {
        "vehicle_count": Vehicle.objects.filter(owner=request.user).count(),
        "applications": PermitApplication.objects.filter(applicant=request.user)[:5],
        "unpaid_invoices": Invoice.objects.filter(client=request.user, status="unpaid"),
    }
    return render(request, "accounts/dashboard.html", context)
