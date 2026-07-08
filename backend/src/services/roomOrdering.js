const collator = new Intl.Collator("es-CO", {
  numeric: true,
  sensitivity: "base"
});

function splitRoomCode(code) {
  const text = String(code || "").trim();
  const match = text.match(/^(\d+)(.*)$/);
  if (!match) return { hasNumberPrefix: false, number: Number.MAX_SAFE_INTEGER, suffix: text };
  return {
    hasNumberPrefix: true,
    number: Number(match[1]),
    suffix: match[2] || ""
  };
}

function compareRoomCodes(leftCode, rightCode) {
  const left = splitRoomCode(leftCode);
  const right = splitRoomCode(rightCode);

  if (left.hasNumberPrefix && right.hasNumberPrefix && left.number !== right.number) {
    return left.number - right.number;
  }
  if (left.hasNumberPrefix !== right.hasNumberPrefix) {
    return left.hasNumberPrefix ? -1 : 1;
  }
  return collator.compare(String(leftCode || ""), String(rightCode || ""));
}

function roomStatusPriority(room) {
  const status = String(room.estado || "").toLowerCase();
  if (status === "inactiva") return 2;
  if (status === "mantenimiento") return 1;
  return 0;
}

function sortRooms(rooms) {
  return [...rooms].sort((left, right) => {
    const statusDiff = roomStatusPriority(left) - roomStatusPriority(right);
    if (statusDiff !== 0) return statusDiff;
    return compareRoomCodes(left.codigo_habitacion, right.codigo_habitacion);
  });
}

module.exports = {
  compareRoomCodes,
  sortRooms
};
