document.addEventListener('DOMContentLoaded', function () {
    var storage_type = {
        0: "on server",
        1: "cloudflare R2",
        2: "qiniu oss",

        get_desc: function (id) {
            return this[id];
        },

    };

    var storagetypes = document.getElementsByClassName("file_storage_type");
    for (var i = 0; i < storagetypes.length; i++) {
        var el = storagetypes[i];
        var storage_id = parseInt(el.innerText.trim());
        if (!isNaN(storage_id) && storage_type.hasOwnProperty(storage_id)) {
            el.innerText = storage_type[storage_id];
        } else {
            el.innerText = "unknown";
        }

    }


});
