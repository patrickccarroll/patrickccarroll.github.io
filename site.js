(function () {
  var defaults = {
    title: "Example Site",
    bio: "This is a fictional placeholder. Copy site.config.example.js to the gitignored site.config.js file to override it locally."
  };

  function apply(config) {
    var title = config.title || defaults.title;
    var bio = config.bio || defaults.bio;
    document.title = title;
    var heading = document.getElementById("site-title");
    var paragraph = document.getElementById("site-bio");
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = bio;
  }

  apply(defaults);

  var script = document.createElement("script");
  script.src = "site.config.js";
  script.onload = function () {
    if (window.SITE_CONFIG && typeof window.SITE_CONFIG === "object") {
      apply(window.SITE_CONFIG);
    }
  };
  script.onerror = function () {};
  document.body.appendChild(script);
})();
