const formatDateCompact = () => new Date().toISOString().split("T")[0].replace(/-/g, "");

const lastTimeDigits = () => new Date().getTime().toString().slice(-4);

export const generatePenjualanId = () => {
  return `PJ-${formatDateCompact()}-${lastTimeDigits()}`;
};

export const generatePembelianId = () => {
  return `BL-${formatDateCompact()}-${lastTimeDigits()}`;
};
