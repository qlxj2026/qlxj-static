async function downloadFile(fileHash, origFileName) {
    try {
        const urlresponse = await fetch(`/api/upload/oss/getPresignedUrl/get?file_hash=${fileHash}`);

        if (!urlresponse.ok) {
            throw new Error("failed to get presigned url");
        }
        const data = await urlresponse.json();
        if (data.status != "successful") {
            throw new Error("failed to get presigned url: api error ", data.status, data.msg || "no msg");
        }

        presigned_url = data.url;

        const link = document.createElement("a");
        link.href = presigned_url;
        // link.download = data.filename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Download fialed:", err);
        alert("Unable to download the file");
    }
}
document.getElementById("download-btn").addEventListener("click", function() {
    const fileHash = this.dataset.fileHash;
    const filename = this.dataset.filename;
    downloadFile(fileHash, filename);
})
