const moment = require('moment');

var utils = {
    
    priceVariance: 1, //percent of price variance to print a log (if an asset fluctuate 1% print a log)
    
    isFunction: (functionToCheck) => {
        return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
    },
    log: (msg, type="normal") => {
        bg_color = "\033[00m";
        if(type=="success") bg_color = "\033[42m";
        if(type=="warning") bg_color = "\033[43m";
        if(type=="danger") bg_color = "\033[41m";
        if(type=="info") bg_color = "\033[46m";
        console.log(bg_color+moment().format("YYYY-MM-DD H:mm:ss")+" "+msg+"\033[00m");
    }
}
module.exports = utils;