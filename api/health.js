'use strict';
const L = require('./_lib');

/* Meldet, ob die Cloud eingerichtet ist und ob die Person angemeldet ist. Ohne Anmeldung erreichbar. */
module.exports = async (req, res) => {
  const cloud = L.configured();
  L.json(res, 200, { cloud, loggedIn: cloud && L.isAuthed(req) });
};
