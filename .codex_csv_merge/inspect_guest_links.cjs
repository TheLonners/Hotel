const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite", { readOnly: true });
console.log(JSON.stringify({
  reservations: db.prepare("SELECT COUNT(*) AS n FROM reservations").get(),
  guestLinks: db.prepare("SELECT COUNT(*) AS n FROM reservation_guests").get(),
  primaryLinked: db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE primary_guest_id IS NOT NULL").get(),
  namedGuests: db.prepare("SELECT COUNT(*) AS n FROM guests WHERE trim(full_name_original) <> ''").get(),
  sampleGuests: db.prepare("SELECT id, full_name_original, source_reservation_id FROM guests ORDER BY id LIMIT 10").all(),
  sampleAirbnbLinks: db.prepare(`SELECT r.id, r.numero_remision, r.nombre_completo_huesped, r.primary_guest_id, rg.guest_id, g.full_name_original FROM reservations r LEFT JOIN reservation_guests rg ON rg.reservation_id=r.id LEFT JOIN guests g ON g.id=rg.guest_id WHERE r.origen_reserva='airbnb' ORDER BY r.id LIMIT 10`).all()
}, null, 2));
