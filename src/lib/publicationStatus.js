export const deliveryLabels = {
  queued: "Instagram: menunggu pemeriksaan dan pengiriman",
  processing: "Instagram: sedang diproses",
  publishing: "Instagram: sedang diterbitkan",
  retry_scheduled: "Instagram: menunggu dicoba lagi",
  published: "Instagram: telah diterbitkan",
  failed: "Instagram: gagal dikirim",
  blocked: "Instagram: tidak dapat diterbitkan",
};

export function websiteLabel(status) {
  if (status === "visible") return "Website: tampil di linimasa";
  if (status === "hidden") return "Website: tidak tampil di linimasa";
  return "Website: belum terkonfirmasi tampil";
}
