Math.log10 = Math.log10 || function(x) { return Math.log(x) / Math.LN10; };

Array.prototype.sum = function() {
  var s = 0;
  for (var i = this.length; i--;) {
    s += this[i];
  }
  return s;
};

Array.prototype.min = function() {
  var len = this.length;
  if (!len) {
    return;
  }
  var min = this[0];
  for (var i = 1; i < len; i++) {
    if (this[i] < min) {
      min = this[i];
    }
  }
  return min;
};

Array.prototype.minIndex = function() {
  var len = this.length;
  if (!len) {
    return;
  }
  var min = this[0];
  var index = 0;
  for (var i = 1; i < len; i++) {
    if (this[i] < min) {
      min = this[i];
      index = i;
    }
  }
  return index;
};

Array.prototype.max = function() {
  var len = this.length;
  if (!len) {
    return;
  }
  var max = this[0];
  for (var i = 1; i < len; i++) {
    if (this[i] > max) {
      max = this[i];
    }
  }
  return max;
};

Array.prototype.maxIndex = function() {
  var len = this.length;
  if (!len) {
    return;
  }
  var max = this[0];
  var index = 0;
  for (var i = 1; i < len; i++) {
    if (this[i] > max) {
      max = this[i];
      index = i;
    }
  }
  return index;
};

Array.prototype.avg = function() { return this.sum() / this.length; };
