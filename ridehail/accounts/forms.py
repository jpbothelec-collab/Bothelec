from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.db import transaction

from .models import DriverProfile, Profile


class RiderSignupForm(UserCreationForm):
    first_name = forms.CharField(max_length=60)
    last_name = forms.CharField(max_length=60)
    email = forms.EmailField()
    phone = forms.CharField(max_length=30)

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "first_name", "last_name", "email")

    role = Profile.RIDER

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs["class"] = "mt-1 block w-full border rounded px-3 py-2"
            field.help_text = ""

    @transaction.atomic
    def save(self, commit=True):
        user = super().save(commit=True)
        Profile.objects.create(user=user, role=self.role, phone=self.cleaned_data["phone"])
        return user


class DriverSignupForm(RiderSignupForm):
    licence_number = forms.CharField(max_length=40)
    prdp_number = forms.CharField(label="PrDP number", max_length=40, required=False)
    operating_licence = forms.CharField(max_length=60, required=False)
    vehicle_make = forms.CharField(max_length=40)
    vehicle_model = forms.CharField(max_length=40)
    vehicle_colour = forms.CharField(max_length=30)
    vehicle_plate = forms.CharField(max_length=20)
    vehicle_class = forms.ChoiceField(choices=DriverProfile.VEHICLE_CLASSES)

    role = Profile.DRIVER

    def clean_vehicle_plate(self):
        plate = self.cleaned_data["vehicle_plate"].upper().replace(" ", "")
        if DriverProfile.objects.filter(vehicle_plate=plate).exists():
            raise forms.ValidationError("A vehicle with this plate is already registered.")
        return plate

    @transaction.atomic
    def save(self, commit=True):
        user = super().save(commit=True)
        DriverProfile.objects.create(user=user, **{
            f: self.cleaned_data[f] for f in (
                "licence_number", "prdp_number", "operating_licence", "vehicle_make",
                "vehicle_model", "vehicle_colour", "vehicle_plate", "vehicle_class")
        })
        return user
