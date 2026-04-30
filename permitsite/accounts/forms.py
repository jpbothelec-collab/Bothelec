from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from .models import ClientProfile


class SignupForm(UserCreationForm):
    company_name = forms.CharField(max_length=200)
    email = forms.EmailField(required=True)
    contact_phone = forms.CharField(max_length=30, required=False)
    vat_number = forms.CharField(max_length=30, required=False)
    billing_address = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}), required=False)
    courier_address = forms.CharField(widget=forms.Textarea(attrs={"rows": 2}), required=False)

    class Meta:
        model = User
        fields = ("username", "email", "company_name", "contact_phone",
                  "vat_number", "billing_address", "courier_address",
                  "password1", "password2")

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        if commit:
            user.save()
            ClientProfile.objects.create(
                user=user,
                company_name=self.cleaned_data["company_name"],
                contact_phone=self.cleaned_data.get("contact_phone", ""),
                vat_number=self.cleaned_data.get("vat_number", ""),
                billing_address=self.cleaned_data.get("billing_address", ""),
                courier_address=self.cleaned_data.get("courier_address", ""),
            )
        return user
