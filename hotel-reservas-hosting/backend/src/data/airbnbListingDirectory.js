// Verified in the Airbnb multicalendar on 2026-07-13. `listingId` is the
// short identifier displayed directly below the listing name in Airbnb.
// The duplicated names were renamed in Airbnb by the operator on 2026-07-13.
// These names are the canonical values for imports and for the local room catalog.
const AIRBNB_LISTING_RENAMES = {
  "43": "Acogedora Suite con Jacuzzi - A", "46": "Acogedora Suite con Jacuzzi - B",
  "4": "Acogedora Suite Doble - A", "5": "Acogedora Suite Doble - B", "6": "Acogedora Suite Doble - C",
  "18": "Acogedora Suite doble - D", "19": "Acogedora Suite doble - E",
  "14": "Acogedora suite doble de lujo - A", "48": "Acogedora suite doble de lujo - B",
  "10": "Encantadora habitación doble - A", "24": "Encantadora habitación doble - B",
  "37": "Hermosa habitación con Jacuzzi - A", "D2": "Hermosa habitación con Jacuzzi - B",
  "25": "Hermosa habitación doble - A", "33": "Hermosa habitación doble - B", "41": "Hermosa habitación doble - C",
  "39": "Hermosa Suite con Jacuzzi - A", "40": "Hermosa Suite con Jacuzzi - B",
  "30": "Hermosa suite de lujo - A", "45": "Hermosa suite de lujo - B",
  "9": "Hermosa Suite doble - A", "17": "Hermosa Suite doble - B",
  "403": "Hermoso apartamento de lujo - A", "406": "Hermoso apartamento de lujo - B",
  "28": "Suite Naturaleza Doble de Lujo - A", "29": "Suite Naturaleza Doble de Lujo - B",
  "36": "Lujosa habitación cuádruple - A", "D1": "Lujosa Habitacion Cuádruple - B"
};

// Names found in the 2026 Airbnb history export. They are retained only as
// import aliases; the current Airbnb listing name remains the canonical name.
const HISTORICAL_AIRBNB_ALIASES = [
  { listingId: "35", name: "Habitación de lujo" },
  { listingId: "16", name: "Apartamento de lujo acogedor" },
  { listingId: "405", name: "Hermosa Apartamento Familiar" }
];

const VERIFIED_AIRBNB_LISTINGS = [
  ["16", "Acogedor alojamiento de lujo"], ["1", "Acogedora habitación colonial"], ["3", "Acogedora habitación doble"],
  ["43", "Acogedora Suite con Jacuzzi"], ["46", "Acogedora Suite con Jacuzzi"], ["4", "Acogedora Suite Doble"],
  ["5", "Acogedora Suite Doble"], ["6", "Acogedora Suite Doble"], ["18", "Acogedora Suite doble"],
  ["19", "Acogedora suite doble"], ["14", "Acogedora suite doble de lujo"], ["48", "Acogedora suite doble de lujo"],
  ["D5", "Alojamiento ideal para grupos"], ["405", "Apartamento de lujo familiar"], ["downhouse", "DownHouse de Lujo Spa Naturaleza"],
  ["10", "Encantadora habitación doble"], ["24", "Encantadora habitación doble"], ["21", "Encantadora habitación triple"],
  ["44", "Encantadora suite de lujo"], ["42", "Encantadora suite Naturaleza"], ["2", "Escape suite Hermosa"],
  ["22", "Habitación cuádruple"], ["47", "Habitacion de lujo familiar"], ["D2", "Hermosa habitación con Jacuzzi"],
  ["34", "Hermosa habitación con tina"], ["35", "Hermosa habitación de lujo"], ["33", "Hermosa habitación doble"],
  ["25", "Hermosa habitación doble"], ["41", "Hermosa habitación doble"], ["FOREST 5", "Hermosa Habitacion Familiar"],
  ["15", "Hermosa habitación Naturaleza"], ["D3", "Hermosa habitación spa natural"], ["40", "Hermosa Suite con Jacuzzi"],
  ["45", "Hermosa suite de lujo"], ["30", "Hermosa suite de lujo"], ["FOREST 4", "Hermosa Suite de lujo con Jacuzzi"],
  ["13", "Hermosa suite de Lujo doble"], ["11", "Hermosa suite de lujo Naturaleza"], ["9", "Hermosa Suite doble"],
  ["17", "Hermosa Suite doble"], ["31", "Hermosa suite familiar de lujo"], ["403", "Hermoso apartamento de lujo"],
  ["406", "Hermoso apartamento de lujo"], ["502", "Increíble apartamento de lujo"], ["404", "Increíble Apartamento de lujo Naturaleza"],
  ["38", "Lujosa habitación con Jacuzzi"], ["36", "Lujosa habitación cuádruple"], ["D1", "Lujosa Habitacion Cuádruple"],
  ["penthouse", "Lujoso Penthouse en la reserva"], ["20", "Magia habitación de lujo"], ["FOREST 2", "Maravillosa Suite familiar Spa"],
  ["23", "Suite de lujo Familiar"], ["7", "Suite moderna"], ["8", "Suite moderna sencilla"], ["D4", "Suite moderna Spa"],
  ["FOREST 1", "Suite moderna Spa Naturaleza"], ["FOREST 3", "Suite moderna spa pareja"], ["29", "Suite Naturaleza doble de lujo"],
  ["28", "Suite Naturaleza Doble de Lujo"], ["27", "Suite Relax Naturaleza"], ["26", "Atardecer de lujo"],
  ["37", "Hermosa habitación con Jacuzzi"], ["39", "Hermosa Suite con Jacuzzi"]
].map(([listingId, name]) => ({ listingId, name: AIRBNB_LISTING_RENAMES[listingId] || name }));

// The local catalog formerly abbreviated these same Airbnb identifiers.
const LEGACY_ROOM_CODES = {
  "FOREST 1": "F1", "FOREST 2": "F2", "FOREST 3": "F3", "FOREST 4": "F4", "FOREST 5": "F5"
};

module.exports = { LEGACY_ROOM_CODES, VERIFIED_AIRBNB_LISTINGS, HISTORICAL_AIRBNB_ALIASES };
