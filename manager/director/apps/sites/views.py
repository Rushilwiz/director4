# SPDX-License-Identifier: MIT
# (c) 2019 The TJHSST Director 4.0 Development Team & Contributors

import json
from typing import Optional

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Max
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from ...utils.appserver import AppserverRequestError, appserver_open_http_request
from . import operations
from .forms import SiteCreateForm, SiteRenameForm
from .models import DockerImage, Site


@login_required
def index_view(request: HttpRequest) -> HttpResponse:
    show_all = request.user.is_superuser and bool(request.GET.get("all"))

    sites = list(Site.objects.filter(users=request.user).order_by("name"))
    if show_all:
        sites.extend(Site.objects.exclude(users=request.user).order_by("name"))

    context = {
        "show_all": show_all,
        "sites": sites,
    }
    return render(request, "sites/list.html", context)


# Used for routes that do not have views written but need to be linked to
@login_required
def dummy_view(  # pylint: disable=unused-argument
    request: HttpRequest, site_id: Optional[int] = None
) -> HttpResponse:
    return HttpResponse("")


@login_required
def rename_view(request: HttpRequest, site_id: int) -> HttpResponse:
    site = get_object_or_404(Site, id=site_id, users=request.user)

    if request.method == "POST":
        form = SiteRenameForm(request.POST)
        if form.is_valid():
            operations.rename_site(site, form.cleaned_data["name"])
            return redirect("sites:info", site.id)
    else:
        form = SiteRenameForm({"name": site.name})

    context = {"site": site, "form": form}

    return render(request, "sites/rename.html", context)


@login_required
def create_view(request: HttpRequest) -> HttpResponse:
    if request.method == "POST":
        form = SiteCreateForm(request.POST)
        if form.is_valid():
            site = form.save(commit=False)

            docker_image = DockerImage.objects.create(name="tmp_site_" + site.name, is_custom=True)
            site.docker_image = docker_image
            site.port = Site.objects.aggregate(Max("port"))["port__max"] + 1
            site.save()
            form.save_m2m()
            docker_image.name = "site_{}".format(site.id)

            operations.create_site(site)

            return redirect("sites:info", site.id)
    else:
        form = SiteCreateForm()

    context = {"form": form}

    return render(request, "sites/create.html", context)


@require_POST
@login_required
def demo_view(request: HttpRequest) -> HttpResponse:
    try:
        # Connect to a random appserver
        resp = appserver_open_http_request(-1, "/demo", method="POST")
    except AppserverRequestError as ex:
        messages.error(request, "Error connecting to appserver: {}".format(ex))
    except json.JSONDecodeError as ex:
        messages.error(request, "Invalid response from appserver: {}".format(ex))
    else:
        messages.info(
            request, "Response from appserver #{}: {}".format(resp.appserver_index + 1, resp.text)
        )

    return redirect("auth:index")


@login_required
def info_view(request: HttpRequest, site_id: int) -> HttpResponse:
    if request.user.is_superuser:
        site = get_object_or_404(Site, id=site_id)
    else:
        site = get_object_or_404(Site, id=site_id, users=request.user)

    context = {"site": site}
    return render(request, "sites/info.html", context)
