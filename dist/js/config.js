/**
 * Deployment configuration.
 *
 * The Google Maps API key is PUBLIC in a static site — it ships to every visitor
 * in plain text. That is normal and expected for the Maps JavaScript API, but it
 * is only safe if the key is restricted:
 *
 *   Google Cloud Console -> APIs & Services -> Credentials -> your key
 *     Application restrictions : HTTP referrers (web sites)
 *     Website restrictions     : add your deployment origin, e.g.
 *                                https://your-domain.example/*
 *     API restrictions         : restrict to "Maps JavaScript API"
 *
 * Without a referrer restriction an unrestricted key can be lifted from this file
 * and billed to your project by anyone. Restrict the key BEFORE deploying.
 *
 * An existing key for this project is currently sitting in publish/appsettings.json.
 * It was deliberately not copied here: reusing a previously server-side key as a
 * public one is a decision to make consciously, and it should be referrer-locked
 * (or rotated) first.
 */
window.APP_CONFIG = {
  googleMapsApiKey: 'AIzaSyCgegjkYNmV6-ntq4EidYQU9XTzUxR_F_U',

  // Matches the .NET app's initMap defaults (Views/Home/Index.cshtml:147-149).
  map: {
    center: { lat: 30.99, lng: 40.95 },
    zoom: 14,
  },
};
