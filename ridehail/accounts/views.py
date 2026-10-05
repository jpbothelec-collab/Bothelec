from django.contrib import messages
from django.contrib.auth import login
from django.shortcuts import redirect, render

from .forms import DriverSignupForm, RiderSignupForm


def _signup(request, form_class, template):
    form = form_class(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        if form_class is DriverSignupForm:
            messages.info(request, "Thanks! Your documents will be checked before you can go online.")
        return redirect("home")
    return render(request, template, {"form": form})


def rider_signup(request):
    return _signup(request, RiderSignupForm, "accounts/signup_rider.html")


def driver_signup(request):
    return _signup(request, DriverSignupForm, "accounts/signup_driver.html")
