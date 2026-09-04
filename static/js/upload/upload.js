// ---------- pure-JS SHA-256 (FIPS 180-4) ----------
    // Used when crypto.subtle is unavailable (plain http:// origins, e.g.
    // http://192.168.x.x:2000 — WebCrypto only exists on secure contexts).
    function _rotr32(x, n) { return (x >>> n) | (x << (32 - n)); }

    const _sha256_js = (function () {
        const K = new Uint32Array([
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ]);
        const H0 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        return function sha256(data) {
            // data: Uint8Array
            const len = data.length;
            const bitLenHi = Math.floor(len / 0x20000000) >>> 0; // high 32 bits of len*8
            const bitLenLo = (len << 3) >>> 0;                   // low 32 bits of len*8
            const paddedLen = ((len + 1 + 8 + 63) & ~63);
            const padded = new Uint8Array(paddedLen);
            padded.set(data);
            padded[len] = 0x80;
            const dv = new DataView(padded.buffer);
            dv.setUint32(paddedLen - 8, bitLenHi);
            dv.setUint32(paddedLen - 4, bitLenLo);

            const H = new Uint32Array(H0);
            const w = new Uint32Array(64);
            for (let off = 0; off < paddedLen; off += 64) {
                for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
                for (let i = 16; i < 64; i++) {
                    const s0 = _rotr32(w[i - 15], 7) ^ _rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                    const s1 = _rotr32(w[i - 2], 17) ^ _rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
                }
                let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
                for (let i = 0; i < 64; i++) {
                    const S1 = _rotr32(e, 6) ^ _rotr32(e, 11) ^ _rotr32(e, 25);
                    const ch = (e & f) ^ (~e & g);
                    const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
                    const S0 = _rotr32(a, 2) ^ _rotr32(a, 13) ^ _rotr32(a, 22);
                    const maj = (a & b) ^ (a & c) ^ (b & c);
                    const t2 = (S0 + maj) >>> 0;
                    h = g; g = f; f = e; e = (d + t1) >>> 0;
                    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
                }
                H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
                H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
            }
            let out = '';
            for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, '0');
            return out;
        };
    })();

    // helper func for calc hash (hex, lowercase, 64 chars)
    async function calc_sha256(file) {
        const buf = await file.arrayBuffer();
        if (crypto && crypto.subtle && crypto.subtle.digest) {
            const hashbuf = await crypto.subtle.digest("SHA-256", buf);
            const hasharr = Array.from(new Uint8Array(hashbuf));
            return hasharr.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        // fallback for non-secure contexts (plain http)
        return _sha256_js(new Uint8Array(buf));
    }

    const pond = FilePond.create(document.getElementById("filepond-input"), {
        allowMultiple: false,
        labelIdle: 'Drag & Drop your file or <span class="filepond--label-action">Browser</span>',

        server: {
            process: (fileName, file, metadata, load, error, progress, abort) => {
                let request = null;

                (async () => {
                    try {
                        // get info
                        const mimetype = file.type || "application/octet-stream";
                        const params = new URLSearchParams({ "mimetype": mimetype });
                        const urlRes = await fetch(`/api/upload/oss/getPresignedUrl/put?${params.toString()}`);
                        if (!urlRes.ok) {
                            throw new Error("could not get presigned url from server (HTTP " + urlRes.status + ")");
                        }
                        const urlData = await urlRes.json();

                        // upload
                        await new Promise((resolve, reject) => {
                            request = new XMLHttpRequest();
                            request.open("PUT", urlData.url);
                            request.setRequestHeader("Content-Type", mimetype);

                            request.upload.onprogress = function (e) {
                                progress(e.lengthComputable, e.loaded, e.total);
                            };

                            request.onload = function (e) {
                                if (request.status >= 200 && request.status <= 300) {
                                    resolve();
                                } else {
                                    reject(new Error("OSS upload failed (HTTP " + request.status + ")"));
                                }
                            };

                            request.onerror = () => {
                                reject(new Error("network error"));
                            };
                            request.send(file);
                        });

                        // calc hash
                        const fileHash = await calc_sha256(file);

                        // reg file to db
                        const regRes = await fetch('/api/upload/oss/register_file', {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                file_name: file.name,
                                oss_key: urlData.filename,
                                file_hash: fileHash,
                                file_size: file.size,
                                mime_type: mimetype
                            })
                        });

                        let regData = null;
                        try {
                            regData = await regRes.json();
                        } catch (e) {
                            // response is not JSON
                            regData = null;
                        }

                        if (regRes.ok && regData && regData.status == 'sucessful' && regData.file_id) {
                            document.getElementById("file_id_input").value = regData.file_id;
                            load(regData.file_id); // to filepond for upload sucesseded
                        } else {
                            const reason = (regData && regData.msg) ? regData.msg : ("HTTP " + regRes.status);
                            throw new Error("DB registration failed: " + reason);
                        }

                    } catch (err) {
                        error(err.message);
                    }
                })();

                return {
                    abort: () => {
                        if (request) {
                            request.abort();
                        }
                        console.log("upload aborted")
                        // tell FilePond the upload was aborted
                        abort();
                    }
                };
            }
        }
    });
