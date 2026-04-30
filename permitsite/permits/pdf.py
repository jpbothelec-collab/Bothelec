"""PDF rendering for provincial permits (one PDF per province per application)."""
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors


def render_permit_pdf(application, line) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=20*mm, bottomMargin=20*mm, title=f"Permit {application.reference} {line.province.code}")
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], alignment=1, fontSize=18)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontSize=9)

    story = []
    story.append(Paragraph(f"ABNORMAL LOAD PERMIT - {line.province.name.upper()}", h1))
    story.append(Paragraph(f"Permit reference: <b>{application.reference} / {line.province.code}</b>", styles["BodyText"]))
    story.append(Spacer(1, 8*mm))

    data = [
        ["Applicant", application.applicant.client_profile.company_name if hasattr(application.applicant, "client_profile") else application.applicant.username],
        ["Contact", application.applicant.email],
        ["Vehicle", f"{application.vehicle.fleet_number} ({application.vehicle.registration})"],
        ["Configuration", f"{application.vehicle.config.code} - {application.vehicle.config.description}"],
        ["Route", f"{application.origin} to {application.destination}"],
        ["Travel date", str(application.travel_date)],
        ["Load description", application.load_description],
        ["Dimensions (L x W x H)", f"{application.load_length_m} x {application.load_width_m} x {application.load_height_m} m"],
        ["Load mass", f"{application.load_mass_kg:,} kg"],
        ["Permit fee (ex VAT)", f"R {line.fee}"],
    ]
    t = Table(data, colWidths=[55*mm, 110*mm])
    t.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.5, colors.black),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.grey),
        ("BACKGROUND", (0,0), (0,-1), colors.lightgrey),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story.append(t)
    story.append(Spacer(1, 8*mm))

    story.append(Paragraph("Fee breakdown", h2))
    story.append(Paragraph(line.breakdown.replace("\n", "<br/>"), small))
    story.append(Spacer(1, 10*mm))

    story.append(Paragraph("Conditions (sample)", h2))
    story.append(Paragraph(
        "1. Permit valid only for the route, vehicle and load described above.<br/>"
        "2. Driver must carry this permit and present on request to any authorised officer.<br/>"
        "3. Travel prohibited during peak traffic hours unless otherwise specified.<br/>"
        "4. Escort requirements per TRH11 and provincial regulations apply.<br/>"
        "5. Permit must be returned on completion or expiry, whichever is earlier.<br/>",
        small,
    ))
    story.append(Spacer(1, 20*mm))
    story.append(Paragraph("_________________________<br/>Authorised officer<br/>Provincial road authority",
                           styles["BodyText"]))
    doc.build(story)
    return buf.getvalue()


def render_invoice_pdf(invoice) -> bytes:
    from django.conf import settings
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=20*mm, bottomMargin=20*mm, title=f"Invoice {invoice.number}")
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=20)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontSize=9)

    story = []
    story.append(Paragraph("TAX INVOICE", h1))
    story.append(Paragraph(f"<b>{settings.COMPANY_NAME}</b><br/>"
                           f"VAT no: {settings.COMPANY_VAT_NUMBER}<br/>"
                           f"{settings.COMPANY_ADDRESS}", small))
    story.append(Spacer(1, 6*mm))

    profile = getattr(invoice.client, "client_profile", None)
    bill_to = profile.company_name if profile else invoice.client.username
    bill_addr = profile.billing_address if profile else ""
    vat_no = profile.vat_number if profile else ""

    header = [
        ["Invoice number", invoice.number, "Issued", str(invoice.issued_at.date())],
        ["Permit ref", invoice.application.reference, "Status", invoice.get_status_display()],
    ]
    t = Table(header, colWidths=[35*mm, 60*mm, 25*mm, 40*mm])
    t.setStyle(TableStyle([("FONTSIZE", (0,0), (-1,-1), 9),
                           ("BACKGROUND", (0,0), (0,-1), colors.lightgrey),
                           ("BACKGROUND", (2,0), (2,-1), colors.lightgrey)]))
    story.append(t)
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph(f"<b>Bill to:</b><br/>{bill_to}<br/>{bill_addr}<br/>VAT: {vat_no}", small))
    story.append(Spacer(1, 6*mm))

    line_data = [["Province", "Description", "Fee (excl VAT)"]]
    for line in invoice.application.lines.all():
        line_data.append([
            line.province.code,
            f"Abnormal load permit - {line.province.name}",
            f"R {line.fee}",
        ])
    line_data.append(["", "Subtotal", f"R {invoice.subtotal}"])
    line_data.append(["", f"VAT @ {invoice.vat_rate*100:.0f}%", f"R {invoice.vat_amount}"])
    line_data.append(["", "Total due", f"R {invoice.total}"])
    t = Table(line_data, colWidths=[25*mm, 100*mm, 35*mm])
    t.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.5, colors.black),
        ("INNERGRID", (0,0), (-1,-3), 0.25, colors.grey),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("ALIGN", (-1,0), (-1,-1), "RIGHT"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("LINEABOVE", (0,-3), (-1,-3), 0.5, colors.black),
    ]))
    story.append(t)
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(
        "<b>Payment details:</b><br/>"
        "Bank: [to configure]<br/>"
        "Account: [to configure]<br/>"
        "Reference: " + invoice.number + "<br/><br/>"
        "Printed permits will be couriered to the address on file once payment is confirmed.",
        small,
    ))
    doc.build(story)
    return buf.getvalue()
