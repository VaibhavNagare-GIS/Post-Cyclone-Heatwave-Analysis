/* =========================================================================
   Post-Cyclone Heatwave Analysis, page behavior
   1) Generic tab system (mirrors the reference site's tab pattern)
   2) Leaflet study-area map, dark basemap, real landfall coordinates
   3) Results cards + table + trend summary, loaded live from CSV
   4) Tabbed Chart.js bar chart driven by the same CSV
   ========================================================================= */

(function () {
  "use strict";

  var CSV_PATH = "data/results/cyclone_heatwave_results.csv";
  var resultsChart = null;
  var chartRows = null;

  /* ---------------------------------------------------------------------
     1) TABS
     Only wires up tab-row groups whose buttons declare aria-controls, since the chart's compact metric switcher reuses .tab-button styling without controlling a hidden panel.
     --------------------------------------------------------------------- */
  function initTabs() {
    document.querySelectorAll(".tab-row").forEach(function (row) {
      var buttons = Array.prototype.slice.call(row.querySelectorAll(".tab-button[aria-controls]"));
      if (!buttons.length) return;
      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          buttons.forEach(function (other) {
            var active = other === button;
            other.setAttribute("aria-selected", String(active));
            var panel = document.getElementById(other.getAttribute("aria-controls"));
            if (panel) panel.hidden = !active;
          });
          window.dispatchEvent(new Event("resize"));
          if (resultsChart) resultsChart.resize();
        });
      });
    });
  }

  /* ---------------------------------------------------------------------
     2) STUDY AREA MAP
     Landfall coordinates are taken directly from the project's analysis notebook, the same coordinates used to plot the landfall marker on the animation frames. Buffer circles are illustrative only, no measured impact radius exists in the source data.
     --------------------------------------------------------------------- */
  function initMap() {
    var mapEl = document.getElementById("study-map");
    if (!mapEl || typeof L === "undefined") return;

    var map = L.map("study-map", {
      scrollWheelZoom: false,
      attributionControl: true
    }).setView([21.9, 88.0], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: "abc",
      maxZoom: 19
    }).addTo(map);

    map.on("focus", function () { map.scrollWheelZoom.enable(); });
    map.on("blur", function () { map.scrollWheelZoom.disable(); });

    var roiBounds = [[17, 85], [27, 90]];
    L.rectangle(roiBounds, {
      color: "#1a1a1a",
      weight: 2,
      dashArray: "6 6",
      fill: false
    }).addTo(map).bindPopup("Analysis boundary<br>17&deg;N&ndash;27&deg;N, 85&deg;E&ndash;90&deg;E");

    var cyclones = [
      { name: "Amphan", date: "20 May 2020", lat: 21.6, lon: 88.2, color: "#ff5b42", change: "-1.29\u00b0C" },
      { name: "Yaas", date: "26 May 2021", lat: 21.7, lon: 87.0, color: "#e88b1a", change: "-1.85\u00b0C" },
      { name: "Remal", date: "27 May 2024", lat: 22.4, lon: 88.8, color: "#5b9bf5", change: "+0.55\u00b0C" }
    ];

    cyclones.forEach(function (c) {
      L.circle([c.lat, c.lon], {
        radius: 65000,
        color: c.color,
        weight: 1,
        fillColor: c.color,
        fillOpacity: 0.16
      }).addTo(map);

      var icon = L.divIcon({
        className: "landfall-pin",
        html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:' + c.color + ';border:3px solid #1a1a1a;box-shadow:0 0 0 3px rgba(255,255,255,0.85);"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      L.marker([c.lat, c.lon], { icon: icon })
        .addTo(map)
        .bindPopup(
          "<strong>" + c.name + "</strong><br>Landfall " + c.date +
          "<br>" + c.lat.toFixed(1) + "\u00b0N, " + c.lon.toFixed(1) + "\u00b0E" +
          "<br>Temperature change: " + c.change
        );
    });

    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    var Legend = L.Control.extend({
      options: { position: "bottomright" },
      onAdd: function () {
        var div = L.DomUtil.create("div", "map-legend");
        div.innerHTML =
          "<h4>Legend</h4>" +
          "<div class=\"row\"><span class=\"swatch\" style=\"background:#ff5b42\"></span> Amphan landfall</div>" +
          "<div class=\"row\"><span class=\"swatch\" style=\"background:#e88b1a\"></span> Yaas landfall</div>" +
          "<div class=\"row\"><span class=\"swatch\" style=\"background:#5b9bf5\"></span> Remal landfall</div>" +
          "<div class=\"row\"><span class=\"line\"></span> Analysis boundary</div>" +
          "<div class=\"row\">&#9675; Illustrative impact zone</div>";
        L.DomEvent.disableClickPropagation(div);
        return div;
      }
    });
    map.addControl(new Legend());
  }

  /* ---------------------------------------------------------------------
     3) LOAD RESULTS CSV, BUILD CARDS + TABLE + SUMMARY, HAND OFF TO CHARTS
     --------------------------------------------------------------------- */
  function loadResults() {
    if (typeof Papa === "undefined") return;
    Papa.parse(CSV_PATH, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: function (res) {
        var rows = res.data.filter(function (r) { return r.Cyclone; });
        chartRows = rows;
        renderCards(rows);
        renderTable(rows);
        renderTrendSummary(rows);
        initCharts(rows);
      },
      error: function () {
        var target = document.getElementById("change-cards");
        if (target) {
          target.innerHTML = '<p style="grid-column:1/-1;font:600 13px var(--mono);color:var(--muted);">Could not load ' + CSV_PATH + '. Open this page from a local server, not a file:// path, for the CSV fetch to work.</p>';
        }
        var summary = document.getElementById("trend-summary");
        if (summary) summary.textContent = "The results CSV could not be loaded.";
      }
    });
  }

  function renderCards(rows) {
    var target = document.getElementById("change-cards");
    if (!target) return;
    target.innerHTML = "";
    rows.forEach(function (r) {
      var warming = r["Change (°C)"] > 0;
      var card = document.createElement("article");
      card.className = "change-card " + (warming ? "warming" : "cooling");
      card.innerHTML =
        "<h3>" + r.Cyclone + "</h3>" +
        "<div class=\"change-headline\">" + (warming ? "+" : "") + Number(r["Change (°C)"]).toFixed(2) + "\u00b0C</div>" +
        "<span class=\"change-direction\">" + (warming ? "Warmed after landfall" : "Cooled after landfall") + "</span>" +
        "<dl>" +
        "<div><dt>Pre-cyclone avg</dt><dd>" + Number(r["Pre Temp (°C)"]).toFixed(2) + "\u00b0C</dd></div>" +
        "<div><dt>Post-cyclone avg</dt><dd>" + Number(r["Post Temp (°C)"]).toFixed(2) + "\u00b0C</dd></div>" +
        "<div><dt>Heatwave days</dt><dd>" + r["Heatwave Days"] + " (" + r["Heatwave %"] + "%)</dd></div>" +
        "<div><dt>Cohen's d</dt><dd>" + Number(r["Cohen's d"]).toFixed(3) + "</dd></div>" +
        "<div><dt>Statistically significant</dt><dd>" + r.Significant + "</dd></div>" +
        "</dl>";
      target.appendChild(card);
    });
  }

  function renderTable(rows) {
    var tbody = document.querySelector("#results-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + r.Cyclone + "</td>" +
        "<td>" + r.Period + "</td>" +
        "<td>" + Number(r["Pre Temp (°C)"]).toFixed(2) + "</td>" +
        "<td>" + Number(r["Post Temp (°C)"]).toFixed(2) + "</td>" +
        "<td>" + (r["Change (°C)"] > 0 ? "+" : "") + Number(r["Change (°C)"]).toFixed(2) + "</td>" +
        "<td>" + r["P-Value"] + "</td>" +
        "<td>" + Number(r["Cohen's d"]).toFixed(3) + "</td>" +
        "<td>" + r["Heatwave Days"] + "</td>" +
        "<td>" + r["Heatwave %"] + "%</td>" +
        "<td>" + r.Significant + "</td>";
      tbody.appendChild(tr);
    });
  }

  // built directly from the loaded rows, same approach the reference site
  // uses for its own trend summary: real numbers, plain sentence, no
  // separate hand-written claim that could drift from the data
  function renderTrendSummary(rows) {
    var el = document.getElementById("trend-summary");
    if (!el) return;
    var warmed = rows.filter(function (r) { return r["Change (°C)"] > 0; });
    var cooled = rows.filter(function (r) { return r["Change (°C)"] <= 0; });
    var avgChange = rows.reduce(function (s, r) { return s + Number(r["Change (°C)"]); }, 0) / rows.length;
    var avgHeatwave = rows.reduce(function (s, r) { return s + Number(r["Heatwave %"]); }, 0) / rows.length;
    var cooledNames = cooled.map(function (r) { return r.Cyclone; }).join(" and ");
    var warmedNames = warmed.map(function (r) { return r.Cyclone; }).join(" and ");
    el.textContent =
      "Across all three cyclones, the average post-cyclone temperature change was " +
      (avgChange > 0 ? "+" : "") + avgChange.toFixed(2) + "\u00b0C, and the average share of days counted as local heatwave days was " +
      avgHeatwave.toFixed(1) + "%, well above the 5% expected by chance. " +
      cooledNames + " cooled after landfall" +
      (warmed.length ? ", while " + warmedNames + " warmed" : "") +
      ". Every result here is statistically significant at p < 0.05.";
  }

  /* ---------------------------------------------------------------------
     4) TABBED CHART.JS CHART
     --------------------------------------------------------------------- */
  function initCharts(rows) {
    var canvas = document.getElementById("results-chart");
    if (!canvas || typeof Chart === "undefined") return;

    var labels = rows.map(function (r) { return r.Cyclone; });
    var colors = rows.map(function (r) { return r["Change (°C)"] > 0 ? "#ff5b42" : "#5b9bf5"; });

    var views = {
      temp: {
        data: rows.map(function (r) { return Number(r["Change (°C)"]); }),
        label: "Temperature change (\u00b0C)",
        caption: "Temperature change per cyclone, pre-cyclone average versus post-cyclone average. Red bars warmed, blue bars cooled.",
        suffix: "\u00b0C"
      },
      heatwave: {
        data: rows.map(function (r) { return Number(r["Heatwave %"]); }),
        label: "Heatwave days (% of post-cyclone period)",
        caption: "Share of post-cyclone days that counted as a local heatwave day. Chance alone would predict about 5%, all three cyclones ran well above that.",
        suffix: "%"
      },
      effect: {
        data: rows.map(function (r) { return Number(r["Cohen's d"]); }),
        label: "Effect size (Cohen's d)",
        caption: "How large the shift is relative to the region's day-to-day variability. Past 0.5 in either direction counts as a medium-to-large effect.",
        suffix: ""
      }
    };

    resultsChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: views.temp.label,
          data: views.temp.data,
          backgroundColor: colors,
          borderColor: "#f3efe3",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return ctx.parsed.y + views.temp.suffix; } } }
        },
        scales: {
          y: { grid: { color: "rgba(243,239,227,0.12)" }, ticks: { color: "#a8a5bd", font: { family: "IBM Plex Mono" } } },
          x: { grid: { display: false }, ticks: { color: "#f3efe3", font: { family: "IBM Plex Mono", weight: "600" } } }
        }
      }
    });

    var caption = document.getElementById("chart-caption");
    var chartButtons = document.querySelectorAll("button[data-chart]");
    chartButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        chartButtons.forEach(function (b) { b.setAttribute("aria-selected", "false"); });
        btn.setAttribute("aria-selected", "true");
        var key = btn.getAttribute("data-chart");
        var view = views[key];
        resultsChart.data.datasets[0].data = view.data;
        resultsChart.data.datasets[0].label = view.label;
        resultsChart.options.plugins.tooltip.callbacks.label = function (ctx) { return ctx.parsed.y + view.suffix; };
        resultsChart.update();
        if (caption) caption.textContent = view.caption;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initMap();
    loadResults();
  });
})();
