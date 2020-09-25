/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
module.exports = {
  sleep: ms => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
