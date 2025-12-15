const formatDateCompact = () => new Date().toISOString().split("T")[0].replace(/-/g, "");

const randomFourDigits = () => {
  const randomPart = Math.floor(Math.random() * 10000);
  const timePart = Number(new Date().getTime().toString().slice(-4));
  const combined = (randomPart + timePart) % 10000;
  return combined.toString().padStart(4, "0");
};

export const generatePenjualanId = () => {
  return `PJ-${formatDateCompact()}-${randomFourDigits()}`;
};

export const generatePembelianId = () => {
  return `BL-${formatDateCompact()}-${randomFourDigits()}`;
};
