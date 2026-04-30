from django import forms
from .models import Vehicle


class VehicleForm(forms.ModelForm):
    class Meta:
        model = Vehicle
        fields = ["fleet_number", "registration", "config", "tare_kg_override", "notes"]
        widgets = {
            "notes": forms.Textarea(attrs={"rows": 2}),
        }
