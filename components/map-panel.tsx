"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import Link from "next/link";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.config.WORKER_URL = "/maplibre-gl-worker.mjs";
import {
  openFindingStatuses,
  severityColors,
  type Asset,
  type DemoState,
  type Finding,
} from "@/lib/demo-data";
import { loadAppState } from "@/lib/app-data";

type AirportStand = {
  code: string;
  apron?: string;
  latitude: number;
  longitude: number;
  openFindings: Finding[];
};

export function MapPanel() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [state, setState] = useState<DemoState | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showAssets, setShowAssets] = useState(true);
  const [showFindings, setShowFindings] = useState(true);
  const [showAirport, setShowAirport] = useState(true);
  const [airportData, setAirportData] = useState<FeatureCollection<Point, { name?: string; type?: string; apron?: string }> | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedStand, setSelectedStand] = useState<AirportStand | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const mapFindings = useMemo(() => {
    if (!state) return [];

    const manualFindings: Finding[] = (state.internalInspectionFindings ?? [])
      .filter((item) => {
        const gps = item.gps;
        return Boolean(
          !item.checklistItemId &&
            gps &&
            Number.isFinite(gps.latitude) &&
            Number.isFinite(gps.longitude) &&
            gps.latitude >= -90 &&
            gps.latitude <= 90 &&
            gps.longitude >= -180 &&
            gps.longitude <= 180,
        );
      })
      .map((item) => ({
        id: item.id,
        findingCode: item.findingCode,
        source: item.source,
        title: item.title,
        description: item.description,
        severity: item.severity,
        status: item.status,
        locationName: item.locationName,
        latitude: item.gps!.latitude,
        longitude: item.gps!.longitude,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

    return [...state.findings, ...manualFindings];
  }, [state]);
  const findingsWithGps = mapFindings.filter(
    (finding): finding is Finding & { latitude: number; longitude: number } =>
      typeof finding.latitude === "number" && Number.isFinite(finding.latitude) &&
      typeof finding.longitude === "number" && Number.isFinite(finding.longitude),
  );

  useEffect(() => {
    loadAppState().then(setState).catch(() => setState(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/fukuoka-airport.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load Fukuoka Airport data.");
        return response.json() as Promise<FeatureCollection<Point, { name?: string; type?: string; apron?: string }>>;
      })
      .then((data) => {
        if (!cancelled) setAirportData(data);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage("福岡空港データを読み込めませんでした。");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || !state || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          "esri-imagery": {
            type: "raster",
            tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            maxzoom: 18,
            attribution: "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
        },
        layers: [
          { id: "esri-imagery", type: "raster", source: "esri-imagery", minzoom: 0, maxzoom: 18 },
        ],
      },
      center: [130.4445, 33.6011],
      zoom: 15,
      maxZoom: 18,
      pitch: 20,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-left",
    );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !airportData || !state || !showAirport) return;

    const markers = airportData.features.map((feature) => {
      const element = document.createElement("div");
      element.className = "airport-stand-marker";
      element.textContent = feature.properties.name ?? "Spot";
      element.title = `${feature.properties.name ?? "Spot"} · ${feature.properties.apron ?? "Fukuoka Airport"}`;
      const [longitude, latitude] = feature.geometry.coordinates;
      const code = feature.properties.name ?? "Spot";
      const openFindings = mapFindings.filter(
        (finding) => finding.airportStandCode === code && openFindingStatuses.has(finding.status),
      );
      element.addEventListener("click", () => {
        setSelectedAsset(null);
        setSelectedFinding(null);
        setSelectedStand({ code, apron: feature.properties.apron, latitude, longitude, openFindings });
        map.flyTo({ center: [longitude, latitude], zoom: 15 });
      });
      return new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat([longitude, latitude])
        .addTo(map);
    });

    return () => markers.forEach((marker) => marker.remove());
  }, [airportData, mapFindings, showAirport, state]);

  useEffect(() => {
    if (!mapRef.current || !state) return;

    const map = mapRef.current;
    const markers: maplibregl.Marker[] = [];

    const markerContainer = (color: string, label: string, onClick?: () => void, markerText = "") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = markerText;
      button.style.width = "18px";
      button.style.height = "18px";
      button.style.borderRadius = "9999px";
      button.style.border = "2px solid #fff";
      button.style.background = color;
      button.style.boxShadow = "0 6px 18px rgba(15, 23, 42, 0.3)";
      button.style.cursor = "pointer";
      button.style.display = "flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.title = label;
      if (onClick) button.addEventListener("click", onClick);
      return button;
    };

    if (showAssets) {
      state.assets.forEach((asset) => {
        const marker = new maplibregl.Marker({
          element: markerContainer("#0ea5e9", `Asset: ${asset.assetCode}`),
        })
          .setLngLat([asset.longitude, asset.latitude])
          .addTo(map);

        marker.getElement().addEventListener("click", () => {
          setSelectedStand(null);
          setSelectedFinding(null);
          setSelectedAsset(asset);
          map.flyTo({ center: [asset.longitude, asset.latitude], zoom: 15 });
        });
        markers.push(marker);
      });
    }

    if (showFindings) {
      findingsWithGps
        .filter((finding) => openFindingStatuses.has(finding.status))
        .forEach((finding) => {
          const severityColor = finding.severity === "CRITICAL" ? severityColors.CRITICAL : "#2563eb";
          const marker = new maplibregl.Marker({
            element: markerContainer(severityColor, `Finding: ${finding.findingCode}`, undefined, "!"),
          })
            .setLngLat([
              finding.longitude,
              finding.latitude + (finding.airportStandCode ? 0.00008 : 0),
            ])
            .addTo(map);

          marker.getElement().style.width = "24px";
          marker.getElement().style.height = "24px";
          marker.getElement().style.border = "3px solid #fff";
          marker.getElement().style.color = "#fff";
          marker.getElement().style.fontSize = "14px";
          marker.getElement().style.fontWeight = "800";
          marker.getElement().style.lineHeight = "1";
          marker.getElement().style.zIndex = "2";
          marker.getElement().style.boxShadow = "0 3px 10px rgba(15, 23, 42, 0.45)";

          marker.getElement().addEventListener("click", () => {
            setSelectedStand(null);
            setSelectedAsset(null);
            setSelectedFinding(finding);
            map.flyTo({ center: [finding.longitude, finding.latitude], zoom: 15 });
          });
          markers.push(marker);
        });
    }

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [findingsWithGps, state, showAssets, showFindings]);

  const searchableRecords = useMemo(() => {
    if (!state) return [] as Array<{ value: string; type: "asset" | "finding"; item: Asset | Finding }>;

    return [
      ...state.assets.map((asset) => ({ value: asset.assetCode.toLowerCase(), type: "asset" as const, item: asset })),
      ...mapFindings.map((finding) => ({ value: finding.findingCode.toLowerCase(), type: "finding" as const, item: finding })),
    ];
  }, [mapFindings, state]);

  const handleSearch = () => {
    if (!state || !mapRef.current) return;

    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      setErrorMessage("");
      return;
    }

    const match = searchableRecords.find((record) => {
      const reference = record.value;
      const asset = record.type === "asset" ? (record.item as Asset) : null;
      const finding = record.type === "finding" ? (record.item as Finding) : null;

      return (
        reference.includes(query) ||
        (asset && `${asset.name} ${asset.locationName}`.toLowerCase().includes(query)) ||
        (finding && `${finding.title} ${finding.locationName}`.toLowerCase().includes(query))
      );
    });

    if (!match) {
      setErrorMessage("No matching asset or finding found.");
      return;
    }

    setErrorMessage("");
    if (match.type === "asset") {
      const asset = match.item as Asset;
      setSelectedStand(null);
      setSelectedFinding(null);
      setSelectedAsset(asset);
      mapRef.current.flyTo({ center: [asset.longitude, asset.latitude], zoom: 15 });
      return;
    }

    const finding = match.item as Finding;
    setSelectedStand(null);
    setSelectedAsset(null);
    setSelectedFinding(finding);
    if (typeof finding.longitude === "number" && typeof finding.latitude === "number") {
      mapRef.current.flyTo({ center: [finding.longitude, finding.latitude], zoom: 15 });
    } else {
      setErrorMessage("This finding has no GPS coordinates.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Spatial view</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Map</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
            placeholder="Search: F-102, Runway 04, AGL-001"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Search
          </button>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showAirport} onChange={() => setShowAirport((value) => !value)} />
              福岡空港スポット
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showAssets} onChange={() => setShowAssets((value) => !value)} />
              Assets
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showFindings} onChange={() => setShowFindings((value) => !value)} />
              Open Findings
            </label>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div ref={mapContainer} className="h-[min(72vh,820px)] min-h-[560px] w-full" />
          {selectedStand ? (
            <div className="border-t border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:absolute lg:right-4 lg:top-20 lg:max-h-[calc(100%-6rem)] lg:w-80 lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-white/95 lg:p-4 lg:shadow-lg lg:backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Parking Bay / Stand</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">{selectedStand.code}</h3>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-800">Apron:</span> {selectedStand.apron ?? "Not specified"}</p>
                <p><span className="font-semibold text-slate-800">Latitude:</span> {selectedStand.latitude.toFixed(6)}</p>
                <p><span className="font-semibold text-slate-800">Longitude:</span> {selectedStand.longitude.toFixed(6)}</p>
                <p><span className="font-semibold text-slate-800">Status:</span> {selectedStand.openFindings.length ? "Problem" : "Normal"}</p>
                <p><span className="font-semibold text-slate-800">Open Findings:</span> {selectedStand.openFindings.length}</p>
              </div>
            </div>
          ) : null}
          {selectedFinding ? (
            <div className="border-t border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:absolute lg:right-4 lg:top-20 lg:max-h-[calc(100%-6rem)] lg:w-80 lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-white/95 lg:p-4 lg:shadow-lg lg:backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Finding</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">{selectedFinding.findingCode}</h3>
              <p className="mt-2 text-base font-semibold text-slate-700">{selectedFinding.title}</p>
              <p className="mt-1 text-sm text-slate-600">{selectedFinding.description}</p>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-800">Location:</span> {selectedFinding.locationName}</p>
                <p><span className="font-semibold text-slate-800">Latitude:</span> {selectedFinding.latitude?.toFixed(6) ?? "Not captured"}</p>
                <p><span className="font-semibold text-slate-800">Longitude:</span> {selectedFinding.longitude?.toFixed(6) ?? "Not captured"}</p>
                <p><span className="font-semibold text-slate-800">Severity:</span> {selectedFinding.severity}</p>
                <p><span className="font-semibold text-slate-800">Status:</span> {selectedFinding.status}</p>
                {selectedFinding.assignedTo ? <p><span className="font-semibold text-slate-800">Assigned Person:</span> {selectedFinding.assignedTo}</p> : null}
                {selectedFinding.assignedTeam ? <p><span className="font-semibold text-slate-800">Assigned Team:</span> {selectedFinding.assignedTeam}</p> : null}
                <p><span className="font-semibold text-slate-800">Created:</span> {new Date(selectedFinding.createdAt).toLocaleDateString()}</p>
              </div>
              <Link
                href={`/issues/${selectedFinding.findingCode}`}
                className="mt-4 inline-flex rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                View Issue
              </Link>
            </div>
          ) : null}
        </div>

        {selectedFinding || selectedAsset ? <div className="space-y-4">
          {selectedAsset ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Asset</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">{selectedAsset.assetCode}</h3>
              <p className="mt-2 text-lg font-semibold text-slate-700">{selectedAsset.name}</p>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-800">Type:</span> {selectedAsset.assetType}</p>
                <p><span className="font-semibold text-slate-800">Location:</span> {selectedAsset.locationName}</p>
                <p><span className="font-semibold text-slate-800">Status:</span> {selectedAsset.status}</p>
              </div>
            </div>
          ) : null}

          {!selectedFinding && !selectedAsset && !selectedStand ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 shadow-sm">
              Select a finding or asset marker to inspect operational details.
            </div>
          ) : null}
        </div> : null}
      </div>
    </div>
  );
}
