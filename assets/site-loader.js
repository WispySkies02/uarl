(async function () {
  "use strict";
  try {
    var data = await window.UARLData.load();
    window.UARL_LIVE_DATA = data;
    window.UARL_EVENT_RECORDS = data.records || [];
    var paintData = document.getElementById("uarl-paint-data");
    if (paintData) paintData.textContent = JSON.stringify(data.paints || []);
    var home = document.getElementById("uarl-home");
    if (home) {
      var now = Date.now();
      var next = (data.events || []).filter(function (event) { return new Date(event.start || event.date).getTime() > now; })
        .sort(function (a,b) { return new Date(a.start || a.date) - new Date(b.start || b.date); })[0];
      var latest = (data.records || []).filter(function (record) { return record.status === "complete"; })
        .sort(function (a,b) { return new Date(b.start || b.date) - new Date(a.start || a.date); })[0];
      var homeData = {};
      if (next) {
        homeData.nextRaceLabel = String(next.division || "UARL").toUpperCase() + " · NEXT EVENT";
        homeData.nextRaceTitle = next.name || next.event;
        homeData.nextRaceDate = new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).format(new Date(next.start || next.date)) + " ET";
        homeData.nextRaceDivision = next.series || String(next.division || "UARL").toUpperCase();
        homeData.nextRaceLaps = next.round == null ? "Special event" : "Round " + String(next.round).padStart(2,"0");
        homeData.nextRaceDesignation = next.special || (next.crownJewel ? "CROWN JEWEL" : next.chase ? "THE CHASE" : "POINTS EVENT");
        homeData.nextRaceHeadline = next.name || next.event;
        homeData.nextRaceNote = [next.track, next.scheduleNote].filter(Boolean).join(" · ");
      }
      if (latest) {
        homeData.lastResultBig = latest.winner || ((latest.finishes || [])[0] || {}).name || "Official";
        homeData.lastResultHeadline = (homeData.lastResultBig || "Winner") + " wins " + (latest.event || latest.name || "the latest UARL race");
        homeData.lastResultNote = latest.recordNote || latest.pointsNote || "Official results are available in Race Center.";
      }
      home.querySelectorAll("[data-uarl-field]").forEach(function (node) {
        var key = node.getAttribute("data-uarl-field");
        if (Object.prototype.hasOwnProperty.call(homeData,key)) node.textContent = homeData[key];
      });
    }
    var guideRoot = document.getElementById("uarl-rules-guide");
    if (guideRoot && Array.isArray(data.guide) && data.guide.length) {
      var guideScope = guideRoot.querySelector("#urg-series");
      var nodes = guideScope ? Array.prototype.slice.call(guideRoot.querySelectorAll("#urg-series h2,#urg-series h3,#urg-series p,#urg-series li,#urg-points h2,#urg-points h3,#urg-points p,#urg-points li,#urg-eligibility h2,#urg-eligibility h3,#urg-eligibility p,#urg-eligibility li,#urg-race-day h2,#urg-race-day h3,#urg-race-day p,#urg-race-day li,#urg-faq h2,#urg-faq h3,#urg-faq p,#urg-faq li")) : [];
      var cursor = 0;
      data.guide.forEach(function (entry) {
        while (cursor < nodes.length && nodes[cursor].tagName.toLowerCase() !== String(entry.tag || "").toLowerCase()) cursor += 1;
        if (cursor < nodes.length) { nodes[cursor].textContent = entry.text || ""; cursor += 1; }
      });
    }
    if (guideRoot && Array.isArray(data.conduct) && data.conduct.length) {
      var rulesById = new Map(data.conduct.map(function (rule) { return [String(rule.id), rule]; }));
      guideRoot.querySelectorAll(".urg-rule").forEach(function (node) {
        var idNode = node.querySelector(".urg-rule-id");
        var rule = idNode && rulesById.get(idNode.textContent.trim());
        if (!rule) return;
        var copy = node.querySelector(".urg-rule-copy");
        var penalty = node.querySelector(".urg-rule-penalty");
        if (copy) copy.textContent = rule.text || "";
        if (penalty) { penalty.textContent = rule.penalty || ""; penalty.classList.toggle("is-severe",Boolean(rule.severe)); }
      });
    }
  } catch (error) {
    console.warn("UARL live data fallback active:", error);
  }
  var script = document.createElement("script");
  script.src = "/assets/site.js";
  script.onload = function () {
    var affiliatePaints = (window.UARL_LIVE_DATA && window.UARL_LIVE_DATA.paints || []).filter(function (paint) { return paint.scrAffiliate; });
    var affiliateIds = new Set(affiliatePaints.map(function (paint) { return String(paint.id); }));
    function applyAffiliateTags() {
      affiliateIds.forEach(function (id) {
        var card = document.querySelector('[data-card-id="' + CSS.escape(id) + '"] .pb-card-tags');
        if (card && !card.querySelector(".pb-scr-affiliate")) card.insertAdjacentHTML("afterbegin",'<span class="pb-scr-affiliate">SCR AFFILIATE</span>');
      });
      var activeId = document.querySelector("[data-pb-dossier-id]");
      var status = document.querySelector("[data-pb-dossier-status]");
      if (activeId && status) {
        var affiliate = affiliateIds.has(activeId.textContent.trim());
        status.textContent = affiliate ? "SCR AFFILIATE" : "LOADED";
        status.classList.toggle("pb-scr-affiliate",affiliate);
      }
    }
    applyAffiliateTags();
    var grid = document.querySelector("[data-pb-grid]");
    var activeId = document.querySelector("[data-pb-dossier-id]");
    if (grid) new MutationObserver(applyAffiliateTags).observe(grid,{childList:true});
    if (activeId) new MutationObserver(applyAffiliateTags).observe(activeId,{childList:true,characterData:true,subtree:true});
  };
  document.body.appendChild(script);
})();
