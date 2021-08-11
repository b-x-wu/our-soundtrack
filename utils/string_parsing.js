const crypto = require('crypto');

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

function encrypt(message) {
  const cipher = crypto.createCipheriv("aes-256-cbc", process.env.SECURITY_KEY, process.env.INIT_VECTOR);
  let encryptedToken = cipher.update(message, 'utf-8', 'hex');
  encryptedToken += cipher.final('hex');
  return encryptedToken;
}

function decrypt(encryptedMessage) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", process.env.SECURITY_KEY, process.env.INIT_VECTOR);
  let decryptedToken = decipher.update(encryptedMessage, 'hex', 'utf-8');
  decryptedToken += decipher.final('utf-8');
  return decryptedToken;
}

module.exports = [serialize, addQueryParams, getFields, encrypt, decrypt];
