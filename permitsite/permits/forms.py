from django import forms
from .models import PermitApplication, Province
from fleet.models import Vehicle


class PermitApplicationForm(forms.ModelForm):
    provinces = forms.ModelMultipleChoiceField(
        queryset=Province.objects.all(),
        widget=forms.CheckboxSelectMultiple,
        help_text="Tick every province this trip passes through",
    )

    class Meta:
        model = PermitApplication
        fields = [
            "vehicle", "origin", "destination", "travel_date",
            "load_description",
            "load_length_m", "load_width_m", "load_height_m", "load_mass_kg",
            "provinces", "notes",
        ]
        widgets = {
            "travel_date": forms.DateInput(attrs={"type": "date"}),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }
        help_texts = {
            "load_length_m": "Overall combination length in metres (e.g. 22.61)",
            "load_width_m":  "Overall combination width in metres (e.g. 3.50)",
            "load_height_m": "Maximum loaded height in metres (e.g. 4.30)",
            "load_mass_kg":  "Total laden mass in kg (combination, without tare)",
        }

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        if user is not None:
            self.fields["vehicle"].queryset = Vehicle.objects.filter(owner=user)
