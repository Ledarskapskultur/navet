/*
 * Navet – formulär för landningssidor.
 * Lägg till på sidan:
 *   <form data-navet action="https://DIN-NAVET/api/inbound/ugl" method="post"> … </form>
 *   <script src="https://DIN-NAVET/navet-form.js" defer></script>
 * Fält som Navet förstår: name, email, phone, organization, subject, date (ÅÅÅÅ-MM-DD),
 * participants, message. Lägg även till ett dolt fält "website" (fälla för spam-robotar).
 * Ett element med attributet data-navet-thanks visas när förfrågan är skickad.
 */
(function () {
  function init(form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var button = form.querySelector("[type=submit]");
      var error = form.querySelector("[data-navet-error]");
      var thanks = form.querySelector("[data-navet-thanks]") || document.querySelector("[data-navet-thanks]");
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v); });
      data.page = data.page || location.href;
      if (button) button.disabled = true;
      if (error) error.hidden = true;
      fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.body.error || "Något gick fel");
          form.reset();
          if (thanks) { thanks.hidden = false; Array.prototype.forEach.call(form.elements, function (el) { el.disabled = true; }); }
          else alert("Tack! Vi återkommer så snart vi kan.");
        })
        .catch(function (err) {
          if (error) { error.textContent = err.message; error.hidden = false; } else alert(err.message);
          if (button) button.disabled = false;
        });
    });
  }
  function start() { document.querySelectorAll("form[data-navet]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
