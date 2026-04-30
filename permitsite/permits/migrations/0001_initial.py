from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("fleet", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Province",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(choices=[("GTN","Gauteng"),("LIMP","Limpopo"),("NWEST","North West"),("ECAPE","Eastern Cape"),("OTHER","Other (WC/KZN/FS/NC/MP)")], max_length=10, unique=True)),
                ("name", models.CharField(max_length=80)),
                ("mass_cpk",        models.DecimalField(decimal_places=4, max_digits=8, default=0, help_text="Abnormal mass fee in c/km")),
                ("length_cpk",      models.DecimalField(decimal_places=4, max_digits=8, default=0, help_text="Over-length fee in c/km per metre over 22 m")),
                ("width_cpk",       models.DecimalField(decimal_places=4, max_digits=8, default=0, help_text="Over-width fee in c/km per metre over 2.5 m")),
                ("basic_fee",       models.DecimalField(decimal_places=2, max_digits=10, default=0)),
                ("fee_minimum",     models.DecimalField(decimal_places=2, max_digits=10, default=0)),
                ("engineering_fee", models.DecimalField(decimal_places=2, max_digits=10, default=0)),
            ],
        ),
        migrations.CreateModel(
            name="PermitApplication",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference", models.CharField(blank=True, max_length=30, unique=True)),
                ("origin", models.CharField(max_length=120)),
                ("destination", models.CharField(max_length=120)),
                ("load_description", models.CharField(max_length=200)),
                ("load_length_m", models.DecimalField(decimal_places=2, max_digits=6)),
                ("load_width_m",  models.DecimalField(decimal_places=2, max_digits=6)),
                ("load_height_m", models.DecimalField(decimal_places=2, max_digits=6)),
                ("load_mass_kg",  models.PositiveIntegerField()),
                ("travel_date",   models.DateField()),
                ("notes",         models.TextField(blank=True)),
                ("status",        models.CharField(choices=[("draft","Draft"),("submitted","Submitted"),("approved","Approved / Paid"),("printed","Permits Printed"),("couriered","Couriered"),("delivered","Delivered"),("rejected","Rejected")], default="draft", max_length=20)),
                ("total_fee",     models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("printed_at",    models.DateTimeField(blank=True, null=True)),
                ("couriered_at",  models.DateTimeField(blank=True, null=True)),
                ("courier_company",  models.CharField(blank=True, max_length=60)),
                ("tracking_number",  models.CharField(blank=True, max_length=60)),
                ("created_at",    models.DateTimeField(auto_now_add=True)),
                ("updated_at",    models.DateTimeField(auto_now=True)),
                ("applicant",     models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="applications", to=settings.AUTH_USER_MODEL)),
                ("vehicle",       models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="fleet.vehicle")),
                ("printed_by",    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="printed_apps", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PermitLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("distance_km", models.PositiveIntegerField(default=0, help_text="Kilometres in this province for this trip")),
                ("fee",         models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("agent_fee",   models.DecimalField(decimal_places=2, default=0, max_digits=10, help_text="Agent/PPRO fee for this province")),
                ("breakdown",   models.TextField(blank=True)),
                ("is_embargo",  models.BooleanField(default=False, help_text="True if travel date falls on an embargo date")),
                ("application", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="permits.permitapplication")),
                ("province",    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="permits.province")),
            ],
            options={"unique_together": {("application", "province")}},
        ),
        migrations.AddField(
            model_name="permitapplication",
            name="provinces",
            field=models.ManyToManyField(through="permits.PermitLine", to="permits.Province"),
        ),
    ]
