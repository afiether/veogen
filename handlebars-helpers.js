const Handlebars = require('handlebars');

module.exports = {
  toJSON: function(obj) {
    return JSON.stringify(obj || null, null, 3);
  },

  /**
   * renderCaptionWords - given an array of objects {word,start,end}
   * returns a SafeString with each word wrapped in a span containing
   * timing data and the caption-word class. The helper leaves a
   * trailing space after each word so that spacing appears correctly
   * when rendered as HTML.
   *
   * Usage inside a template:
   *   {{{ renderCaptionWords captions }}}
   * where `captions` is an array from the server-side context.
   */
  renderCaptionWords: function(arr) {
    if (!Array.isArray(arr)) {
      return '';
    }
    const segments = arr.map(item => {
      const word = String(item.word || '');
      const start = Number(item.start) || 0;
      const end = Number(item.end) || 0;
      // escape HTML in word by letting Handlebars do it when using text() later
      return `<span class=\"caption-word\" data-start=\"${start}\" data-end=\"${end}\">${Handlebars.escapeExpression(word)}</span>`;
    });
    // join with spaces so words don't collapse
    return new Handlebars.SafeString(segments.join(' '));
  }
};