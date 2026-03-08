module.exports = {
  toJSON: function(obj) {
    return JSON.stringify(obj || null, null, 3);
  }
};