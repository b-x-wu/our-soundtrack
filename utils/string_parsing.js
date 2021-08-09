function serialize(obj) {
  var str = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
}

function addQueryParams(url, obj) {
    return url + "?" + serialize(obj);
}

function getFields(obj, arr) {
    var o = {}
    for (let s of arr) {
        o[s] = obj[s];
    }
    return o;
}

module.exports = [serialize, addQueryParams, getFields];
