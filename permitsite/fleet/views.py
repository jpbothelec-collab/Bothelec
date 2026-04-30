from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from .models import Vehicle
from .forms import VehicleForm


@login_required
def vehicle_list(request):
    vehicles = Vehicle.objects.filter(owner=request.user)
    return render(request, "fleet/list.html", {"vehicles": vehicles})


@login_required
def vehicle_create(request):
    if request.method == "POST":
        form = VehicleForm(request.POST)
        if form.is_valid():
            v = form.save(commit=False)
            v.owner = request.user
            v.save()
            messages.success(request, f"Added {v.fleet_number}")
            return redirect("fleet_list")
    else:
        form = VehicleForm()
    return render(request, "fleet/form.html", {"form": form, "title": "Add vehicle"})


@login_required
def vehicle_edit(request, pk):
    v = get_object_or_404(Vehicle, pk=pk, owner=request.user)
    if request.method == "POST":
        form = VehicleForm(request.POST, instance=v)
        if form.is_valid():
            form.save()
            messages.success(request, "Updated")
            return redirect("fleet_list")
    else:
        form = VehicleForm(instance=v)
    return render(request, "fleet/form.html", {"form": form, "title": f"Edit {v.fleet_number}"})


@login_required
def vehicle_delete(request, pk):
    v = get_object_or_404(Vehicle, pk=pk, owner=request.user)
    if request.method == "POST":
        v.delete()
        messages.success(request, "Deleted")
        return redirect("fleet_list")
    return render(request, "fleet/confirm_delete.html", {"vehicle": v})
