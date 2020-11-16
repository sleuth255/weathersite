// settings you need to change
var myLatitude = 42.9764;
var myLongitude = -88.1084;
var myWLLIp = '10.0.0.42';

var myMetarFtpSite = "tgftp.nws.noaa.gov";
var myMetarFilePath = "/data/observations/metar/stations/KMKE.TXT";
var myRadarZoominPath = "https://radar.weather.gov/lite/N0R/MKX_loop.gif"
var myRadarZoomoutPath = "https://radar.weather.gov/lite/N0Z/MKX_loop.gif"


var express = require('express')
, request = require('request')
, routes = require('routes')
, user = require('user')
, http = require('http')
, LocalStorage = require('node-localstorage').LocalStorage
, udp = require('dgram')
, buffer = require('buffer')
, suncalc = require('suncalc')
, jsftp = require("jsftp")
, clone = require("clone")
, barchart = require('./barChart.json')
, linechart = require('./lineChart.json')
, path = require('path');

var app = express();
if (myMetarFtpSite.length > 0){
   var ftp = new jsftp({
	   host: myMetarFtpSite
   });
   ftp.keepAlive();
   ftp.on('error', function(err){
	   console.log('Ftp error caught');
	   ftp = new jsftp({
		   host: myMetarFtpSite
	   });
   })
}

process.on('uncaughtException', function(err){
	console.error(err.stack);
	console.log('uncaught exception: node NOT exiting...');
})

var server = udp.createSocket('udp4'); 
server.bind(22222);
app.locals.moment = require('moment');

//initialize local storage
var oDate,oTemp,oHum,oDewpt,oWindspd,oWinddir,oWindgust,oBarometer
var localStorage = new LocalStorage('/Weathersite Stats'); 
if ((localStorage.getItem("oDate"))==null)
	oDate = [];
else
	oDate = JSON.parse(localStorage.getItem("oDate"));
if ((localStorage.getItem("oTemp"))==null)
	oTemp = [];
else
	oTemp = JSON.parse(localStorage.getItem("oTemp"));
if ((localStorage.getItem("oHum"))==null)
	oHum = [];
else
	oHum = JSON.parse(localStorage.getItem("oHum"));
if ((localStorage.getItem("oDewpt"))==null)
	oDewpt = [];
else
	oDewpt = JSON.parse(localStorage.getItem("oDewpt"));
if ((localStorage.getItem("oWindspd"))==null)
	oWindspd = [];
else
	oWindspd = JSON.parse(localStorage.getItem("oWindspd"));
if ((localStorage.getItem("oWinddir"))==null)
	oWinddir = [];
else
	oWinddir = JSON.parse(localStorage.getItem("oWinddir"));
if ((localStorage.getItem("oWindgust"))==null)
	oWindgust = [];
else
	oWindgust = JSON.parse(localStorage.getItem("oWindgust"));
if ((localStorage.getItem("oBarometer"))==null)
	oBarometer = [];
else
	oBarometer = JSON.parse(localStorage.getItem("oBarometer"));

//all environments

app.set('port', process.env.PORT || 5000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.logger('dev'));

function shiftHist(array){
	var newArray = []
	for(var x = 1; x < array.length; x++)
		newArray.push(array[x])
	return newArray;
}
function makeSkyConditionsVector(){
	var skyconditions = 1;
	if (metarObservation.indexOf("CLR") != -1)
		skyconditions = 1;
	if (metarObservation.indexOf("FEW") != -1)
		skyconditions = 2;
	if (metarObservation.indexOf("SCT") != -1)
		skyconditions = 3;
	if (metarObservation.indexOf("BKN") != -1)
		skyconditions = 4;
	if (metarObservation.indexOf("OVC") != -1)
		skyconditions = 5;
    if (rainStormRate > 0)
		skyconditions = 6;
	if (metarObservation.indexOf("SN") != -1)
		skyconditions = 7;
	if (metarObservation.indexOf("LTG") != -1)
		skyconditions = 8;
	return skyconditions
}
function makeMoonPhaseVector(){
	var daystart = new Date(app.locals.moment(new Date()).format('MMMM DD,YYYY 00:00:00'));
	var dayend = new Date(daystart)
	dayend.setDate(daystart.getDate()+1)
	var dayStartPhase = suncalc.getMoonIllumination(daystart).phase
	var dayEndPhase = suncalc.getMoonIllumination(dayend).phase
	if (dayStartPhase > dayEndPhase)
		return 0;
    if (dayStartPhase < .25 && dayEndPhase > .25)
    	return 2;
    if (dayStartPhase < .5 && dayEndPhase > .5)
    	return 4;
    if (dayStartPhase < .75 && dayEndPhase > .75)
    	return 6;
    if (dayStartPhase < .25)
    	return 1;
    if (dayStartPhase < .5)
    	return 3;
    if (dayStartPhase < .75)
    	return 5;
    return 7;
    	
}
function makeCompassVector(direction){
	var left=top=rotation=0;
	var heading='';
    switch(true){
    case (direction == 0):
           break;
       case (direction < 22.5):
 	       heading='N';left=226;top=103;rotation=0;
 	       break;
       case (direction < 45):
    	   heading='NNE';left=276;top=113;rotation=22.5;
    	   break;
       case (direction < 67.5):
    	   heading='NE';left=318;top=142;rotation=45;
    	   break;
       case (direction < 90):
    	   heading='ENE';left=346;top=185;rotation=67.5;
    	   break;
       case (direction < 112.5):
    	   heading='E';left=355;top=235;rotation=90;
    	   break;
       case (direction < 135):
    	   heading='ESE';left=345;top=283;rotation=112.50;
    	   break;
       case (direction < 157.5):
    	   heading='SE';left=316;top=325;rotation=135;
    	   break;
       case (direction < 180):
    	   heading='SSE';left=273;top=353;rotation=157.5;
    	   break;
       case (direction < 202.5):
    	   heading='S';left=224;top=362;rotation=180;
    	   break;
       case (direction < 225):
    	   heading='SSW';left=174;top=351;rotation=202.5;
    	   break;
       case (direction < 247.5):
    	   heading='SW';left=132;top=323;rotation=225;
    	   break;
       case (direction < 270):
    	   heading='WSW';left=104;top=280;rotation=247.5;
    	   break;
       case (direction < 292.5):
    	   heading='W';left=95;top=231;rotation=270;
    	   break;
       case (direction < 315):
    	   heading='WNW';left=105;top=183;rotation=292.5;
    	   break;
       case (direction < 337.5):
    	   heading='NW';left=133;top=141;rotation=315;
    	   break;
       case (direction < 361):
    	   heading='NNW';left=176;top=112;rotation=337.5;
    	   break;
       default:
           break;
    }
    return {heading: heading,left: left,top: top,rotation: rotation};
}
/***************************************************************/
// globals
let cookie = {};
var metarObservation = "";
var direction = 0;
var lastDirection3 = lastDirection2 = lastDirection1 = lastDirection = 0;
var speed = 0;
var gustSpeed = 0;
var gustDirection = 0;
var avgSpeed = 0
var avgDirection = 0
var inTemp = 0;
var inHum = 0;
var outTemp = 0;
var outTempLastReading = null;
var outHum = 0;
var outDewPt = 0;
var outWindChill = 0;
var outHeatIdx = 0;
var outTempTrend = 0;
var inBarometer = 0;
var inBarometerTrend;
var rainStormStart = '';
var rainStormAmt = 0;
var rainStormRate = 0;
var sunrise;
var sunset;
var now = new Date();
var moonsize = makeMoonPhaseVector();
var daytime = suncalc.getTimes(now,myLatitude,myLongitude);
sunrise = daytime.sunrise;
sunset = daytime.sunset;
if ((now > daytime.dusk && now > daytime.dawn) || (now < daytime.dawn && now < daytime.dusk))
	daytime = 0;
else
	daytime = 1;

//process...
app.get('/', function (req, res) {
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
	
    res.render('defaultresponse',{zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,sunrise: sunrise,sunset: sunset,day: daytime,directionObj: directionObj,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,speed:speed,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/liveconditions', function (req, res) {
    res.render('liveconditions',{zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),day: daytime,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/tileconditions', function (req, res) {
    res.render('tileconditions',{zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/livewind', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
    res.render('livewind',{zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,directionObj: directionObj,speed:speed})
})
app.get('/radar', function (req, res) {
    res.locals.err = false;
	res.render('radarresponse',{skyconditions: makeSkyConditionsVector(),moonsize: moonsize,sunrise: sunrise,sunset: sunset,day: daytime,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath})
})
app.get('/radarrefresh', function (req, res) {
    res.locals.err = false;
	res.render('radarrefresh',{skyconditions: makeSkyConditionsVector(),moonsize: moonsize,sunrise: sunrise,sunset: sunset,day: daytime,zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath})
})
app.get('/charts', function (req, res) {
    res.locals.err = false;
    var xData = ["|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"];
    for (var x=0;x<xData.length;x++){
    	if (xData[x] == "|")
    		if (x < oDate.length)
    			xData[x] = app.locals.moment(oDate[x]).format('ha')
    }
    xData = xData.slice(0,oTemp.length)
    var fontColor = "#fff"
    if (daytime  && makeSkyConditionsVector() < 5)
    	fontColor = "#000"

    var lineOptions = clone(linechart);
    lineOptions.legend.data = ["Outside Temp","Dew Point"]
    lineOptions.legend.textStyle.color = fontColor
    lineOptions.xAxis.data = xData;
    lineOptions.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.series[0].name = "Outside Temp"
    lineOptions.series[0].data = oTemp
    lineOptions.series[1].name = "Dew Point"
    lineOptions.series[1].data = oDewpt

    var lineOptions2 = clone(linechart);
    lineOptions2.yAxis.axisLabel.formatter = "{value} mph"
    lineOptions2.legend.data = ["Wind Speed", "Wind Gust"]
    lineOptions2.legend.textStyle.color = fontColor
    lineOptions2.xAxis.data = xData;
    lineOptions2.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.series[0].name = "Wind Speed"
    lineOptions2.series[0].data = oWindspd
    lineOptions2.series[1].name = "Wind Gust"
    lineOptions2.series[1].data = oWindgust

    var lineOptions3 = clone(linechart);
    lineOptions3.yAxis.axisLabel.formatter = "{value}\u201d"
    lineOptions3.legend.data = ["Barometer"]
    lineOptions3.legend.textStyle.color = fontColor
    lineOptions3.xAxis.data = xData;
    lineOptions3.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.series[0].name = "Barometer"
    lineOptions3.series[0].data = oBarometer
    lineOptions3.series[1].name = ""
    lineOptions3.series[1].data = []

    res.render('charts',{data: JSON.stringify(lineOptions),data2: JSON.stringify(lineOptions2),data3: JSON.stringify(lineOptions3),skyconditions: makeSkyConditionsVector(),zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,moonsize: moonsize,sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/chartrefresh', function (req, res) {
    res.locals.err = false;
    var xData = ["|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"," "," "," "," "," "," "," "," "," "," "," ","|"];
    for (var x=0;x<xData.length;x++){
    	if (xData[x] == "|")
    		if (x < oDate.length)
    			xData[x] = app.locals.moment(oDate[x]).format('ha')
    }
    xData = xData.slice(0,oTemp.length)
    var fontColor = "#fff"
    if (daytime  && makeSkyConditionsVector() < 5)
    	fontColor = "#000"

    var lineOptions = clone(linechart);
    lineOptions.legend.data = ["Outside Temp","Dew Point"]
    lineOptions.legend.textStyle.color = fontColor
    lineOptions.xAxis.data = xData;
    lineOptions.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions.series[0].name = "Outside Temp"
    lineOptions.series[0].data = oTemp
    lineOptions.series[1].name = "Dew Point"
    lineOptions.series[1].data = oDewpt

    var lineOptions2 = clone(linechart);
    lineOptions2.yAxis.axisLabel.formatter = "{value} mph"
    lineOptions2.legend.data = ["Wind Speed","Wind Gust"]
    lineOptions2.legend.textStyle.color = fontColor
    lineOptions2.xAxis.data = xData;
    lineOptions2.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.series[0].name = "Wind Speed"
    lineOptions2.series[0].data = oWindspd
    lineOptions2.series[1].name = "Wind Gust"
    lineOptions2.series[1].data = oWindgust

    var lineOptions3 = clone(linechart);
    lineOptions3.yAxis.axisLabel.formatter = "{value}\u201d"
    lineOptions3.legend.data = ["Barometer"]
    lineOptions3.legend.textStyle.color = fontColor
    lineOptions3.xAxis.data = xData;
    lineOptions3.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions3.series[0].name = "Barometer"
    lineOptions3.series[0].data = oBarometer
    lineOptions3.series[1].name = ""
    lineOptions3.series[1].data = []

    res.render('chartrefresh',{data: JSON.stringify(lineOptions),data2: JSON.stringify(lineOptions2),data3: JSON.stringify(lineOptions3),skyconditions: makeSkyConditionsVector(),zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,moonsize: moonsize,sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/testpattern', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	var y = 0
	for (var x = 1;x<360;x+=22.5){
	    directionObj[y++] = makeCompassVector(x)
	}
	console.log(oTemp.length)
	for (var x=0;x<oTemp.length;x++)
		console.log(oTemp[x]);
    res.render('testpattern',{zoominradarimage: myRadarZoominPath,zoomoutradarimage: myRadarZoomoutPath,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,moonsize: moonsize,sunrise: sunrise,sunset: sunset,directionObj: directionObj})
})


//UDP Server

server.on('listening',function(){
  var address = server.address();
  var port = address.port;
  var family = address.family;
  var ipaddr = address.address;
  console.log('UDP Server is listening at port ' + port);
  console.log('UDP Server IP is ' + ipaddr);
  console.log('UDP Server is : ' + family);
});
server.on('message',function(msg,info){
	  //console.log(msg.toString());
	  var obj = JSON.parse(msg);
	  direction=obj.conditions[0].wind_dir_last;
	  if (direction != lastDirection){
	     lastDirection3 = lastDirection2;
	     lastDirection2 = lastDirection1;
	     lastDirection1 = lastDirection;
	     lastDirection = direction;
      }
	  speed=Math.round(obj.conditions[0].wind_speed_last);
	  gustDirection=obj.conditions[0].wind_dir_at_hi_speed_last_10_min;
	  gustSpeed=Math.round(obj.conditions[0].wind_speed_hi_last_10_min);
	  //rainStormStart='1603243501';
	  rainStormStart=obj.conditions[0].rain_storm_start_at
	  rainStormAmt=(obj.conditions[0].rain_storm *.01).toFixed(2);
	  rainStormRate=obj.conditions[0].rain_rate_last *.01
	  
	  if (rainStormStart == null){
		  rainStormStart = ''
	  }
	  else{
		  rainStormStart = app.locals.moment.unix(rainStormStart).format('MMM D, h:mm a')
	  }
});


// Get initial METAR observation
if (myMetarFtpSite.length > 0){
   var Observation = ""; // Will store the contents of the file
   try{
   console.log('Retrieving METAR observation');
   ftp.get(myMetarFilePath, (err, socket) => {
     if (err) {
       return;
     }

     socket.on("data", d => {
       Observation += d.toString();
     });

     socket.on("close", err => {
       if (err) {
         console.error("Metar Observation retrieval error.");
         return
       }
       metarObservation = Observation;
       console.log("METAR observation retrieved");
     });

     socket.resume();
   });
   }
   catch(err){
       console.log('Caught Metar Observation error')
   }
}
//Get initial conditions from WLL.
//Also tell WLL to start broadcasting live UDP Wind/Rainfall data every 5 minutes

console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
var req1 = http.get('http://'+myWLLIp+'/v1/current_conditions',function(resp){
	data = '';
	resp.on('data',function(chunk){
		data+=chunk
	})
	resp.on('end',function(){
		console.log(data.toString())
		var obj = JSON.parse(data);
		avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
		avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
		inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
		inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
		outTempLastReading = outTemp = Math.round(obj.data.conditions[0].temp);
		outTempLastReading = obj.data.conditions[0].temp;
		outHum = Math.round(obj.data.conditions[0].hum);
		outDewPt = Math.round(obj.data.conditions[0].dew_point);
		outWindChill = Math.round(obj.data.conditions[0].wind_chill);
		outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
		inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
		inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
		if (oDate.length > 143)
			oDate = shiftHist(oDate)
		oDate.push(new Date());
	    localStorage.setItem("oDate",JSON.stringify(oDate));
		if (oTemp.length > 143)
			oTemp = shiftHist(oTemp)
		oTemp.push(outTemp);
	    localStorage.setItem("oTemp",JSON.stringify(oTemp));
		if (oHum.length > 143)
			oHum = shiftHist(oHum)
		oHum.push(outHum);
	    localStorage.setItem("oHum",JSON.stringify(oHum));
		if (oDewpt.length > 143)
			oDewpt = shiftHist(oDewpt)
		oDewpt.push(outDewPt);
	    localStorage.setItem("oDewpt",JSON.stringify(oDewpt));
		if (oWindspd.length > 143)
			oWindspd = shiftHist(oWindspd)
		oWindspd.push(avgSpeed);
	    localStorage.setItem("oWindspd",JSON.stringify(oWindspd));
		if (oWinddir.length > 143)
			oWinddir = shiftHist(oWinddir)
		oWinddir.push(avgDirection);
	    localStorage.setItem("oWinddir",JSON.stringify(oWinddir));
		if (oWindgust.length > 143)
			oWindgust = shiftHist(oWindgust)
		oWindgust.push(gustSpeed);
	    localStorage.setItem("oWindgust",JSON.stringify(oWindgust));
		if (oBarometer.length > 143)
			oBarometer = shiftHist(oBarometer)
		oBarometer.push(inBarometer);
	    localStorage.setItem("oBarometer",JSON.stringify(oBarometer));
		if (inBarometerTrend < 0)
			inBarometerTrend = 'Falling'
		else
		if (inBarometerTrend > 0)
			inBarometerTrend = 'Rising'
		else
			inBarometerTrend = 'Steady'
		req1.end();
		console.log('UDP broadcast request begins')
		var req2 = http.get('http://'+myWLLIp+'/v1/real_time?duration=300',function(resp){
			data = '';
			resp.on('data',function(chunk){
				data+=chunk
			})
			resp.on('end',function(){
				console.log('UDP Broadcast request accepted')
				req2.end();
				//console.log(data.toString())
			})
		}).on('error',(err) =>{
			   console.log("UDP broadcast initial request failure")
			   req2.end();
		})
	})
}).on('error',(err) =>{
	   console.log("Current conditions initial request failure")
	   req1.end();
})

// Primary 5 minute weather conditions refresh code block follows
// get METAR Observation from NOAA FTP site and local conditions from WLL  
// Tell WLL server to continue to send UDP packets

setInterval(function(){
	   console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
if (myMetarFtpSite.length > 0){
	   var Observation = ""; // Will store the contents of the file
	   try{
	      console.log('Retrieving METAR observation');
          ftp.get(myMetarFilePath, (err, socket) => {
            if (err) {
              return;
            }

            socket.on("data", d => {
              Observation += d.toString();
            });

            socket.on("close", err => {
              if (err) {
                console.error("METAR data retrieval error");
                return;
              }
              metarObservation = Observation;
              console.log("METAR observation retrieved");
            });
            socket.resume();
          });
   	      }
	      catch(err){
		      console.log('Caught Metar Observation error')
	      }
       }
	   var req1 = http.get('http://'+myWLLIp+'/v1/current_conditions',function(resp){
		   data = '';
		   resp.on('data',function(chunk){
			   data+=chunk
		   })
		   resp.on('end',function(){
			   console.log('current conditions reply received')
			   var obj = JSON.parse(data);
			   avgSpeed = Math.round(obj.data.conditions[0].wind_speed_avg_last_10_min);
			   avgDirection = Math.round(obj.data.conditions[0].wind_dir_scalar_avg_last_10_min);
			   inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
			   inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
			   outTemp = Math.round(obj.data.conditions[0].temp);
			   outHum = Math.round(obj.data.conditions[0].hum);
			   outDewPt = Math.round(obj.data.conditions[0].dew_point);
			   outWindChill = Math.round(obj.data.conditions[0].wind_chill);
			   outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
			   inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
			   inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
			   if (oDate.length > 143)
				   oDate = shiftHist(oDate)
			   oDate.push(new Date());
		       localStorage.setItem("oDate",JSON.stringify(oDate));
			   if (oTemp.length > 143)
				   oTemp = shiftHist(oTemp)
			   oTemp.push(outTemp);
			   localStorage.setItem("oTemp",JSON.stringify(oTemp));
			   if (oHum.length > 143)
				   oHum = shiftHist(oHum)
			   oHum.push(outHum);
			   localStorage.setItem("oHum",JSON.stringify(oHum));
			   if (oDewpt.length > 143)
				   oDewpt = shiftHist(oDewpt)
			   oDewpt.push(outDewPt);
			   localStorage.setItem("oDewpt",JSON.stringify(oDewpt));
			   if (oWindspd.length > 143)
				   oWindspd = shiftHist(oWindspd)
			   oWindspd.push(avgSpeed);
			   localStorage.setItem("oWindspd",JSON.stringify(oWindspd));
			   if (oWinddir.length > 143)
				   oWinddir = shiftHist(oWinddir)
			   oWinddir.push(avgDirection);
			   localStorage.setItem("oWinddir",JSON.stringify(oWinddir));
			   if (oWindgust.length > 143)
				   oWindgust = shiftHist(oWindgust)
			   oWindgust.push(gustSpeed);
			   localStorage.setItem("oWindgust",JSON.stringify(oWindgust));
			   if (oBarometer.length > 143)
			   	   oBarometer = shiftHist(oBarometer)
			   oBarometer.push(inBarometer);
  		       localStorage.setItem("oBarometer",JSON.stringify(oBarometer));
			   if (inBarometerTrend < 0)
				   inBarometerTrend = 'Falling'
			   else
			   if (inBarometerTrend > 0)
				   inBarometerTrend = 'Rising'
			   else
				   inBarometerTrend = 'Steady'
			   if (outTempLastReading == null)
				   outTempLastReading == obj.data.conditions[0].temp;
			   if (obj.data.conditions[0].temp > outTempLastReading)
				   outTempTrend = 1;
			   else
			   if (obj.data.conditions[0].temp < outTempLastReading)
				   outTempTrend = -1;
			   else
				   outTempTrend = 0;
			   outTempLastReading = obj.data.conditions[0].temp;

			   console.log('starting WLL UDP refresh request')
			   req1.end();
			   var req2 = http.get('http://'+myWLLIp+'/v1/real_time?duration=300',function(resp){
				   data = '';
				   resp.on('data',function(chunk){
				    data+=chunk
				   })
				   resp.on('end',function(){
				    console.log('UDP request processed')
				    req2.end();
				   })
			   }).on('error',(err) =>{
				   console.log("UDP request failure")
				   req2.end();
			   })
		   })
	   }).on('error',(err) =>{
		   console.log("Current conditions request failure")
		   req1.end();
	   })
}, 5*60*1000); 

// periodically determine day/night and moon phase

setInterval(function(){
	var now = new Date();
	var obj = suncalc.getTimes(now,myLatitude,myLongitude)
	if ((now > obj.dusk && now > obj.dawn) || (now < obj.dawn && now < obj.dusk))
		daytime = 0;
	else
		daytime = 1;
	sunrise = obj.sunrise;
	sunset = obj.sunset;
	moonsize = makeMoonPhaseVector();
}, 10*60*1000); 

console.log("Current Moon phase fraction is "+suncalc.getMoonIllumination(now).phase)

//Start up  Web server

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});


