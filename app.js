/* eslint-disable */
//
//  User Settings: changed on the settings page and stored in userSettings local storage file

var us = {
    myLatitude: 0,
    myLongitude: 0,
    myWLLIp: '', 
    myMetarFtpSite: '',
    myMetarFilePath: '',
    myRadarZoominPath: '',
    myRadarZoomoutPath: '',
	myClimacellApiKey: '',
	mySettingsCIDR: '',
    observationUnits: {
      metricTemp: false,
      metricRain: false,
      metricPressure: false,
      metricSpeed: false
    }
}
	
var weatherSiteVersion = '1.7'
var express = require('express')
, request = require('request')
, http = require('http')
, https = require('https')
, LocalStorage = require('node-localstorage').LocalStorage
, udp = require('dgram')
, spawn = require('child_process').spawn
, suncalc = require('suncalc')
, jsftp = require("jsftp")
, clone = require("clone")
, myIpAddress = require("ip").address()
, ipcidr = require('ip-cidr')
, ifaces = require("os").networkInterfaces()
, linechart = require('./lineChart.json')
, portscanner = require('portscanner')
, path = require('path');

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.logger('dev'));
app.locals.moment = require('moment');
app.locals.moment_tz = require('moment-timezone');


process.on('uncaughtException', function(err){
	console.error(err.stack);
})

//initialize local storage

var oDate,oTemp,oHum,oDewpt,oWindspd,oWinddir,oWindgust,oBarometer
var localStorage = new LocalStorage('/WeathersiteStats'); 

if ((localStorage.getItem("userSettings"))!=null)
   us = JSON.parse(localStorage.getItem("userSettings"))


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




/***************************************************************/
//globals
var myUrl = "http://"+myIpAddress+":"+app.get('port')
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
var forecastObj = {};
var sunrise;
var sunset;
var gust;
var ftp;
var wndOccurrence = null; 
var wndTCPOccurrence = null;
var rainOccurrence = null;
var metarHandle = null;
var climacellHandle = null;
var WLLHandle = null;
var now = new Date();
var moonsize = makeMoonPhaseVector();
var daytime = suncalc.getTimes(now,us.myLatitude,us.myLongitude);
sunrise = daytime.sunrise;
sunset = daytime.sunset;
if ((now > daytime.dusk && now > daytime.dawn) || (now < daytime.dawn && now < daytime.dusk))
	daytime = 0;
else
	daytime = 1;

// Global functions

function startClimacellqueries(){
   dt = new Date()
   var isoOffset=""
   var tzName ="";
   offset = dt.getTimezoneOffset();
   if (offset < 0){
	 isoOffset = '+'
	 offset *= -1;
   }
   else
	 isoOffset ='-';
   offset = Math.floor(offset / 60)
   if (offset < 10)
	 isoOffset +="0"
   isoOffset += offset.toString()+':00'
   tzName = app.locals.moment_tz.tz.guess();
   console.log('Timezone offset is '+isoOffset + ' ('+tzName+')') 
   sdt = new Date()
   edt = new Date()
   sdt.setDate(dt.getDate()+1)
   edt.setDate(dt.getDate()+4)
//   sdt = app.locals.moment(sdt).format('YYYY-MM-DD')+'T06:00:00'+isoOffset;
//   edt = app.locals.moment(edt).format('YYYY-MM-DD')+'T06:00:00'+isoOffset;
   sdt = app.locals.moment(sdt).format('YYYY-MM-DD')+'T06:00:00Z';
   edt = app.locals.moment(edt).format('YYYY-MM-DD')+'T06:00:00Z';
   var ccreq = "https://api.tomorrow.io/v4/timelines?location="+us.myLatitude+"%2C"+us.myLongitude+"&startTime="+sdt+"&endTime="+edt+"&timezone="+tzName+"&fields=weatherCode&timesteps=1h&apikey="+us.myClimacellApiKey;
   //console.log(ccreq)   
   var req0 = https.get(ccreq,function(resp){
	   var ccdata = '';
	   resp.on('data',function(chunk){
		   ccdata+=chunk
	   })
	   resp.on('end',function(){
		   var valid = true;
		   try{
			  //console.log(ccdata);
			  var forecastObjTmp = JSON.parse(ccdata);
		   }
		   catch(e){
			   valid = false;
		   }
		   if (forecastObjTmp.data.timelines[0].intervals.length == 0)
			    valid = false;
		   if (valid)
			   forecastObj = forecastObjTmp;
		   req0.end();
	   })
   }).on('error',function(){
	      console.log("Forecast initial request failure")
	      req0.end();
   })
   // get additional forecast data every 30 minutes
   clearInterval(climacellHandle)
   climacellHandle = setInterval(function(){
	   dt = new Date()
	   sdt = new Date()
	   edt = new Date()
	   sdt.setDate(dt.getDate()+1)
	   edt.setDate(dt.getDate()+4)
//	   sdt = app.locals.moment(sdt).format('YYYY-MM-DD')+'T06:00:00'+isoOffset;
//	   edt = app.locals.moment(edt).format('YYYY-MM-DD')+'T06:00:00'+isoOffset;
       sdt = app.locals.moment(sdt).format('YYYY-MM-DD')+'T06:00:00Z';
       edt = app.locals.moment(edt).format('YYYY-MM-DD')+'T06:00:00Z';
       var ccreq = "https://data.climacell.co/v4/timelines?location="+us.myLatitude+"%2C"+us.myLongitude+"&startTime="+sdt+"&endTime="+edt+"&timezone="+tzName+"&fields=weatherCode&timesteps=1h&apikey="+us.myClimacellApiKey;
	   var req0 = https.get(ccreq,function(resp){
		   var ccdata = '';
		   resp.on('data',function(chunk){
			   ccdata+=chunk
		   })
		   resp.on('end',function(){
   		      var valid = true;
		      try{
			     var forecastObjTmp = JSON.parse(ccdata);
		      }
		      catch(e){
			      valid = false;
			  }
			  if (forecastObjTmp.data.timelines[0].intervals.length == 0)
			      valid = false;
		      if (valid)
				   forecastObj = forecastObjTmp;
			  req0.end();
		   })
	   }).on('error',function(){
		      console.log("ClimaCell Forecast request failure")
		      req0.end();
	   })

	
   },30*60*1000) 
}
function startMETARqueries(){
   // log onto FTP site
   ftp = new jsftp({
      host: us.myMetarFtpSite
   });
   ftp.keepAlive();
   ftp.on('error', function(){
      console.log('Ftp error caught');
      ftp.raw("QUIT");
      ftp.destroy();
      ftp = new jsftp({
        host: us.myMetarFtpSite
      });
   })
   // METAR observation logic
   // Get initial observation
   var Observation = ""; // Will store the contents of the file
   try{
      console.log('Retrieving METAR observation');
      ftp.get(us.myMetarFilePath, (err, socket) => {
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
   // Get additional observations every 15 minutes
   clearInterval(metarHandle);
   metarHandle = setInterval (function(){
	   var Observation = ""; // Will store the contents of the file
	   try{
	      console.log('Retrieving METAR observation');
          ftp.get(us.myMetarFilePath, (err, socket) => {
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
   },15*60*1000)
}
function startWLLqueries(){
	//Get initial conditions from WLL.
	//Also tell WLL to start broadcasting live UDP Wind/Rainfall data every 5 minutes
	console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
	var req1 = http.get('http://'+us.myWLLIp+'/v1/current_conditions',function(resp){
		data = '';
		resp.on('data',function(chunk){
			data+=chunk
		})
		resp.on('end',function(){
			//console.log(data.toString())
			var wndTCPOcc = 0;
			var obj = JSON.parse(data);
			if (wndTCPOccurrence == null){ // locate the wind sensor
				for(var x = 0;x< obj.data.conditions.length;x++)
					if (obj.data.conditions[x].wind_speed_hi_last_10_min > 0){
						wndTCPOccurrence = x;
						break;
				    }
			}
			if (wndTCPOccurrence != null)
			   wndTCPOcc = wndTCPOccurrence;
		    gust = Math.round(obj.data.conditions[wndTCPOcc].wind_speed_hi_last_10_min)
		    if (us.observationUnits.metricSpeed)
		    	gust = Math.round(gust * 1.60934)
			avgSpeed = Math.round(obj.data.conditions[wndTCPOcc].wind_speed_avg_last_10_min);
		    if (us.observationUnits.metricSpeed)
		    	avgSpeed = Math.round(avgSpeed * 1.60934) 
			avgDirection = Math.round(obj.data.conditions[wndTCPOcc].wind_dir_scalar_avg_last_10_min);
			if (avgDirection == 0 && oWinddir.length > 0)
			    avgDirection = oWinddir[oWinddir.length -1] // use last wind direction if there is one and windspeed avg is zero
			inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
		    if (us.observationUnits.metricTemp)
		    	inTemp = Math.round(((inTemp -32) *5)/9)
			inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
			outTemp = Math.round(obj.data.conditions[0].temp);
			outTempLastReading = Math.round(obj.data.conditions[0].temp);
		    if (us.observationUnits.metricTemp){
		    	outTemp = Math.round(((outTemp -32) *5)/9)
		    	outTempLastReading = Math.round(((outTempLastReading -32) *5)/9)
		    }
			outHum = Math.round(obj.data.conditions[0].hum);
			outDewPt = Math.round(obj.data.conditions[0].dew_point);
		    if (us.observationUnits.metricTemp)
		    	outDewPt = Math.round(((outDewPt -32) *5)/9)
			outWindChill = Math.round(obj.data.conditions[0].wind_chill);
			outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
		    if (us.observationUnits.metricTemp){
		    	outWindChill = Math.round(((outWindChill -32) *5)/9)
		    	outHeatIdx = Math.round(((outHeatIdx -32) *5)/9)
		    }
			inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
		    if (us.observationUnits.metricPressure)
			  inBarometer = (inBarometer * 33.8639).toFixed(1);
			inBarometerTrend = obj.data.conditions[obj.data.conditions.length-1].bar_trend
			while (oDate.length > 143)
				oDate = shiftHist(oDate)
			oDate.push(new Date());
		    localStorage.setItem("oDate",JSON.stringify(oDate));
			while (oTemp.length > 143)
				oTemp = shiftHist(oTemp)
			oTemp.push(outTemp);
		    localStorage.setItem("oTemp",JSON.stringify(oTemp));
			while (oHum.length > 143)
				oHum = shiftHist(oHum)
			oHum.push(outHum);
		    localStorage.setItem("oHum",JSON.stringify(oHum));
			while (oDewpt.length > 143)
				oDewpt = shiftHist(oDewpt)
			oDewpt.push(outDewPt);
		    localStorage.setItem("oDewpt",JSON.stringify(oDewpt));
			while (oWindspd.length > 143)
				oWindspd = shiftHist(oWindspd)
			oWindspd.push(avgSpeed);
		    localStorage.setItem("oWindspd",JSON.stringify(oWindspd));
			while (oWinddir.length > 143)
				oWinddir = shiftHist(oWinddir)
			oWinddir.push(avgDirection);
		    localStorage.setItem("oWinddir",JSON.stringify(oWinddir));
			while (oWindgust.length > 143)
				oWindgust = shiftHist(oWindgust)
			oWindgust.push(gust);
		    localStorage.setItem("oWindgust",JSON.stringify(oWindgust));
			while (oBarometer.length > 143)
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
			var req2 = http.get('http://'+us.myWLLIp+'/v1/real_time?duration=300',function(resp){
				data = '';
				resp.on('data',function(chunk){
					data+=chunk
				})
				resp.on('end',function(){
					console.log('UDP Broadcast request accepted')
					req2.end();
					//console.log(data.toString())
				})
			}).on('error',function(){
				   console.log("UDP broadcast initial request failure")
				   req2.end();
			})
		})
	}).on('error',function(err){
		   console.log("Current conditions initial request failure: "+err)
		   req1.end();
	})
	// Primary 5 minute weather conditions refresh code block follows
	// get local conditions from WLL  
	// Tell WLL server to continue to send UDP packets
	clearInterval(WLLHandle)
	req1.shouldKeepAlive = false;
	WLLHandle = setInterval(function(){
		   console.log(app.locals.moment(Date.now()).format('MM/DD/YY h:mm:ss a')+': Retrieving current conditions')
		   var req1 = http.get('http://'+us.myWLLIp+'/v1/current_conditions',function(resp){
			   data = '';
			   resp.on('data',function(chunk){
				   data+=chunk
			   })
			   resp.on('end',function(){
				    console.log('current conditions reply received')
				    var obj = JSON.parse(data);
			        var wndTCPOcc = 0;
			        var obj = JSON.parse(data);
			        if (wndTCPOccurrence == null){ // locate the wind sensor
				        for(var x = 0;x< obj.data.conditions.length;x++)
					        if (obj.data.conditions[x].wind_speed_hi_last_10_min > 0){
						        wndTCPOccurrence = x;
						        break;
				            }
			        }
			        if (wndTCPOccurrence != null)
			           wndTCPOcc = wndTCPOccurrence;
				    var gust = Math.round(obj.data.conditions[wndTCPOcc].wind_speed_hi_last_10_min)
				    if (us.observationUnits.metricSpeed)
				   	    gust = Math.round(gust * 1.60934)
				    avgSpeed = Math.round(obj.data.conditions[wndTCPOcc].wind_speed_avg_last_10_min);
				    if (us.observationUnits.metricSpeed)
				        avgSpeed = Math.round(avgSpeed * 1.60934) 
				    avgDirection = Math.round(obj.data.conditions[wndTCPOcc].wind_dir_scalar_avg_last_10_min);
					if (avgDirection == 0 && oWinddir.length > 0)
			    		avgDirection = oWinddir[oWinddir.length -1] // use last wind direction if there is one and windspeed avg is zero
					inTemp = Math.round(obj.data.conditions[obj.data.conditions.length-2].temp_in);
				    if (us.observationUnits.metricTemp)
				    	inTemp = Math.round(((inTemp -32) *5)/9)
					inHum = Math.round(obj.data.conditions[obj.data.conditions.length-2].hum_in);
					outTemp = Math.round(obj.data.conditions[0].temp);
					outTempLastReading = Math.round(obj.data.conditions[0].temp);
				    if (us.observationUnits.metricTemp){
				    	outTemp = Math.round(((outTemp -32) *5)/9)
				    	outTempLastReading = Math.round(((outTempLastReading -32) *5)/9)
				    }
					outHum = Math.round(obj.data.conditions[0].hum);
					outDewPt = Math.round(obj.data.conditions[0].dew_point);
				    if (us.observationUnits.metricTemp)
				    	outDewPt = Math.round(((outDewPt -32) *5)/9)
					outWindChill = Math.round(obj.data.conditions[0].wind_chill);
					outHeatIdx = Math.round(obj.data.conditions[0].heat_index);
				    if (us.observationUnits.metricTemp){
				    	outWindChill = Math.round(((outWindChill -32) *5)/9)
				    	outHeatIdx = Math.round(((outHeatIdx -32) *5)/9)
				    }
					inBarometer = Math.round((obj.data.conditions[obj.data.conditions.length-1].bar_sea_level)*100)/100
				    if (us.observationUnits.metricPressure)
					  inBarometer = (inBarometer * 33.8639).toFixed(1);
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
				    oWindgust.push(gust);
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
				    var req2 = http.get('http://'+us.myWLLIp+'/v1/real_time?duration=300',function(resp){
					    data = '';
					    resp.on('data',function(chunk){
					     data+=chunk
					    })
					    resp.on('end',function(){
					     console.log('UDP request processed')
					     req2.end();
					    })
				    }).on('error',function(){
				 	    console.log("UDP request failure")
				 	    req2.end();
				    })
			    })
		   }).on('error',function(err){
			   console.log("Current conditions request failure: "+err)
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
				    oWindgust.push(gust);
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
			   req1.destroy();
			   startWLLqueries();
		   })
		req1.shouldKeepAlive = false;
	}, 5*60*1000); 
}

function iterateHttpTargets(list,current){
	portscanner.checkPortStatus(80,list[current],function(error,status){
	   if (status == 'open')
	      request({url: 'http://'+list[current]+'/v1/current_conditions',timeout: 5*1000},function(error,response,body){
		      if (!error && response.statusCode == 200 && body.substr(0,14) == '{"data":{"did"'){
		          console.log('found WLL at '+list[current])
		          us.myWLLIp = list[current];
		          localStorage.setItem("userSettings",JSON.stringify(us))
	              spawn('python3',[__dirname+'/pidisplay.py','Weathersite is Online',myIpAddress+':5000','WLL is '+us.myWLLIp]).on('error',function(){}); //toss error
		          startWLLqueries();
		      }
		      else
		      if (current < list.length)
			      iterateHttpTargets(list,++current)
		      else{
				console.log("WLL not found")
                spawn('python3',[__dirname+'/pidisplay.py','Weathersite is Online',myIpAddress+':5000','WLL not found']).on('error',function(){}); //toss error
			  }
	      })
	   else
       if (current < list.length)
		   iterateHttpTargets(list,++current)
	   else{
		   console.log("WLL not found")
           spawn('python3',[__dirname+'/pidisplay.py','Weathersite is Online',myIpAddress+':5000','WLL not found']).on('error',function(){}); //toss error
		}
	})
}
function findWLL(){
	console.log("starting WLL search")
	var myCIDR;
	for (var key in ifaces){
		var info = ifaces[key]
		for(var x=0;x<info.length;x++)
			if (info[x].address == myIpAddress)
	            myCIDR = info[x].cidr
	}
	var cidr = new ipcidr(myCIDR)
	iterateHttpTargets(cidr.toArray(),0)
}
function shiftHist(array){
	var newArray = []
	for(var x = 1; x < array.length; x++)
		newArray.push(array[x])
	return newArray;
}
function analyze14ForecastObjs(start){
	var conditionsArray = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
	var skyConditions = [1,2,3,4,5,5,5,9,9,6,6,8,10,10,7,7,11,11,11,11,11,11,11]
	var weatherCode = ["Clear","'Mostly Clear","Partly Cloudy","Mostly Cloudy","Overcast","Light Fog","Dense Fog","Light Rain","Drizzle","Rain","Heavy Rain","Thunderstorms","Snow Flurries","Light Snow","Snow","Heavy Snow","Lignt Icing","Ice Pellets","Heavy Icing","Freezing Drizzle","Light Freezing Rain","Freezing Rain","Heavy Freezing Rain"]
	var x=0, amt=0, occ=0;

	for(x = start; x<(start+14); x++){
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '1000')
			   conditionsArray[0]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '1100')
			   conditionsArray[1]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '1101')
			   conditionsArray[2]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '1102')
			   conditionsArray[3]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '1001')
			   conditionsArray[4]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '2100')
			   conditionsArray[5]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '2000')
			   conditionsArray[6]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '4200')
			   conditionsArray[7]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '4000')
			   conditionsArray[8]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '4001')
			   conditionsArray[9]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '4201')
			   conditionsArray[10]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '8000')
			   conditionsArray[11]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '5001')
			   conditionsArray[12]++;
		   else
			if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '5100')
			   conditionsArray[13]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '5000')
			   conditionsArray[14]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '5101')
			   conditionsArray[15]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '7102')
			   conditionsArray[16]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '7000')
			   conditionsArray[17]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '7101')
			   conditionsArray[18]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '6000')
			   conditionsArray[19]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '6200')
			   conditionsArray[20]++;
		   else
		   if (forecastObj.data.timelines[0].intervals[x].values.weatherCode == '6001')
			   conditionsArray[21]++;
		   else
			   conditionsArray[22]++;
	}
	//  decrease the weight of common conditions
	if(conditionsArray[4] > 8) // lots of clouds may mean some precip too
	   conditionsArray[4] -=4;
	//  increase the weight of interesting conditions
	if (conditionsArray[11] > 0) // T-Storms are really interesting
		conditionsArray[11]+=8	
    if (conditionsArray[12] > 0 || conditionsArray[13] > 0 || conditionsArray[14] > 0 || conditionsArray[15] > 0){ // any Snow			
	   amt = 0
/*	   
	   occ = 14	
	   for (x=12;x<16;x++)  // which Snow?
		 if (conditionsArray[x] > amt){
			amt = conditionsArray[x]
			occ = x		
		 }
	   conditionsArray[occ]+= 4
*/	   
	   for (x=12;x<16;x++){  // aggregate Snow
		   amt += conditionsArray[x];
		   conditionsArray[x] = 0;
	   }
	   conditionsArray[14] = amt;
	}


	if (conditionsArray[7] > 0 || conditionsArray[8] > 0 || conditionsArray[9] > 0 || conditionsArray[10] > 0){ // any Rain
	   amt = 0
/*	   
	   occ = 9	
	   for (x=7;x<11;x++)  // which Rain?
		 if (conditionsArray[x] > amt){
			amt = conditionsArray[x]
			occ = x
		 }
	   conditionsArray[occ]+= 4
*/
	   for (x=7;x<11;x++){  // aggregate Rain
		   amt += conditionsArray[x];
		   conditionsArray[x] = 0;
	   }
	   conditionsArray[9] = amt;
	}
// pick the winner
	var occurrence = 0
	var amount = 0
	for (x=0;x<24;x++)
	    if (conditionsArray[x] > amount){
			occurrence = x;
			amount = conditionsArray[x]
		}
	return({skyconditions: skyConditions[occurrence],weather: weatherCode[occurrence]})
}
function makeSkyConditionsVector(){
	var skyconditions = [];
	var obj = {
			skyconditions: 1,
			weather: 'Unavailable'
	}
	if (metarObservation.indexOf("CLR") != -1){
		obj.skyconditions = 1;
		obj.weather = 'Clear';
	}	
	if (metarObservation.indexOf("FEW") != -1){
		obj. skyconditions = 2;
		obj.weather = 'Mostly Clear';
	}
	if (metarObservation.indexOf("SCT") != -1){
		obj.skyconditions = 3;
		obj.weather = 'Partly Cloudy';
	}
	if (metarObservation.indexOf("BKN") != -1){
		obj.skyconditions = 4;
		obj.weather = 'Mostly Cloudy';
    }
	if (metarObservation.indexOf("OVC") != -1){
		obj. skyconditions = 5;
		obj.weather = 'Overcast';
	}
    if (rainStormRate > 0){
		obj.skyconditions = 6;
		obj.weather = 'Raining';
    }
	if (metarObservation.indexOf("SN") != -1 && metarObservation.indexOf("SNE") == -1 && metarObservation.indexOf("DSN") == -1){
		obj.skyconditions = 7;
		obj.weather = 'Snowing';
	}
	if (metarObservation.indexOf("LTG") != -1){
		obj.skyconditions = 8;
		obj.weather = 'Thunderstorms';
	}
	if (metarObservation.indexOf("FG") != -1){
		obj.skyconditions = 5;
		obj.weather = 'Dense Fog';
	}
	skyconditions.push(obj);
	
// now get forecasts
	if (typeof forecastObj.data !== 'undefined')
	    for(var x = 0; x<49;x+=24)
		    skyconditions.push(analyze14ForecastObjs(x));
	else{
		var obj = {
				skyconditions: 1,
				weather: 'Unavailable'
		}
		for(var x=1;x<4;x++)
		    skyconditions.push(obj)
	}
	return skyconditions
}
function getLunarDetails(){
	var now = new Date();
	var moonIllumination = Math.floor(suncalc.getMoonIllumination(now).fraction * 100);
	var newVector = 0;
	var start = new Date(app.locals.moment(new Date()).format('MMMM DD,YYYY 00:00:00'));
	var daystart = new Date(start)
	var dayend = new Date(start)
	for (var x=1; x < 31; x++){
		daystart = new Date(start)
        daystart.setDate(daystart.getDate()+x)
        dayend.setDate(daystart.getDate()+1)
    	var dayStartPhase = suncalc.getMoonIllumination(daystart).phase
    	var dayEndPhase = suncalc.getMoonIllumination(dayend).phase
    	if (dayStartPhase > dayEndPhase){
    		newVector = 0;
    		break;
    	}
    	else
        if (dayStartPhase <= .25 && dayEndPhase > .25){
        	newVector = 2;
        	break;
        }
        else
        if (dayStartPhase <= .5 && dayEndPhase > .5){
        	newVector = 4;
        	break;
        }
        else
        if (dayStartPhase <= .75 && dayEndPhase > .75){
        	newVector = 6;
        	break;
        }
	}
	 var moonPhase = 'New Moon'
     if (newVector == 2)
        moonPhase = 'First Quarter';
     else 
     if (newVector == 4)
        moonPhase = 'Full Moon';
     else 
     if (newVector == 6)
        moonPhase = 'Third Quarter';
	return {illumination: moonIllumination,nextPhaseDate: app.locals.moment(daystart).format('ddd MMM Do'), nextPhaseType: moonPhase}
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
	if (direction == 0)
       return {heading: heading,left: left,top: top,rotation: rotation};
	direction = 22.5 * Math.round(direction / 22.5)
    switch(true){
    case (direction == 0):
	       heading='N';left=226;top=103;rotation=0;
           break;
       case (direction == 22.5):
    	   heading='NNE';left=276;top=113;rotation=22.5;
    	   break;
       case (direction == 45):
    	   heading='NE';left=318;top=142;rotation=45;
    	   break;
       case (direction == 67.5):
    	   heading='ENE';left=346;top=185;rotation=67.5;
    	   break;
       case (direction == 90):
    	   heading='E';left=355;top=235;rotation=90;
    	   break;
       case (direction == 112.5):
    	   heading='ESE';left=345;top=283;rotation=112.50;
    	   break;
       case (direction == 135):
    	   heading='SE';left=316;top=325;rotation=135;
    	   break;
       case (direction == 157.5):
    	   heading='SSE';left=273;top=353;rotation=157.5;
    	   break;
       case (direction == 180):
    	   heading='S';left=224;top=362;rotation=180;
    	   break;
       case (direction == 202.5):
    	   heading='SSW';left=174;top=351;rotation=202.5;
    	   break;
       case (direction == 225):
    	   heading='SW';left=132;top=323;rotation=225;
    	   break;
       case (direction == 247.5):
    	   heading='WSW';left=104;top=280;rotation=247.5;
    	   break;
       case (direction == 270):
    	   heading='W';left=95;top=231;rotation=270;
    	   break;
       case (direction == 292.5):
    	   heading='WNW';left=105;top=183;rotation=292.5;
    	   break;
       case (direction == 315):
    	   heading='NW';left=133;top=141;rotation=315;
    	   break;
       case (direction == 337.5):
    	   heading='NNW';left=176;top=112;rotation=337.5;
    	   break;
       case (direction == 360):
 	       heading='N';left=226;top=103;rotation=0;
 	       break;
       default:
           break;
    }
    return {heading: heading,left: left,top: top,rotation: rotation};
}

//process...
app.get('/', function (req, res) {
	if (us.myLatitude == 0 && us.myLongitude == 0)
	   return(res.redirect('/settings?response=Initial Weathersite Setup'))
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
	
    res.render('defaultresponse',{response: req.query.response,loadstylesheet: true,observationUnits: us.observationUnits,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime,directionObj: directionObj,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,speed:speed,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/liveconditions', function (req, res) {
    res.render('liveconditions',{loadstylesheet: false,observationUnits: us.observationUnits,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),day: daytime,rainStormStart: rainStormStart,rainStormAmt: rainStormAmt,rainStormRate: rainStormRate,outTempTrend: outTempTrend,inBarometer: inBarometer,inBarometerTrend: inBarometerTrend,outWindChill, outWindChill, outHeatIdx: outHeatIdx,inTemp: inTemp, inHum: inHum, outTemp: outTemp, outHum: outHum, outDewPt: outDewPt,avgSpeed: avgSpeed,avgDirection: makeCompassVector(avgDirection).heading,gustSpeed: gustSpeed,gustDirection: makeCompassVector(gustDirection).heading})
})
app.get('/tileconditions', function (req, res) {
    res.render('tileconditions',{loadstylesheet: false,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/refreshsuntile', function (req, res) {
    res.render('refreshsuntile',{loadstylesheet: false,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/livewind', function (req, res) {
    res.locals.err = false;
	var directionObj = []
	directionObj[0] = makeCompassVector(direction)
	directionObj[1] = makeCompassVector(lastDirection);
	directionObj[2] = makeCompassVector(lastDirection1);
	directionObj[3] = makeCompassVector(lastDirection2);
	directionObj[4] = makeCompassVector(lastDirection3);
    res.render('livewind',{loadstylesheet: false,observationUnits: us.observationUnits,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,directionObj: directionObj,speed:speed})
})
app.get('/radar', function (req, res) {
	res.render('radarresponse',{weatherSiteVersion: weatherSiteVersion,loadstylesheet: true,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath})
})
app.get('/radarrefresh', function (req, res) {
    res.locals.err = false;
	res.render('radarrefresh',{weatherSiteVersion: weatherSiteVersion,loadstylesheet: false,skyconditions: makeSkyConditionsVector(),moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath})
})
app.get('/charts', function (req, res) {
    var xData = [" "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "];
    var hrStart = app.locals.moment(oDate[0]).format('HH')
    for (var x=0;x<oDate.length;x++){
    	if (app.locals.moment(oDate[x]).format('HH') != hrStart){
    		hrStart = app.locals.moment(oDate[x]).format('HH');
   			xData[x] = app.locals.moment(oDate[x]).format('ha');
    	}
    }
    xData = xData.slice(0,oDate.length)
    var fontColor = "#fff"
    if (daytime  && makeSkyConditionsVector()[0].skyconditions < 5)
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
    lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0F"
    lineOptions2.yAxis.axisLabel.formatter = "{value} mph"
    lineOptions2.legend.data = ["Wind Speed","Wind Gust","Wind Direction"]
    lineOptions2.legend.textStyle.color = fontColor
    lineOptions2.xAxis.data = xData;
    lineOptions2.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.series[0].name = "Wind Speed"
    lineOptions2.series[0].data = oWindspd
    lineOptions2.series[1].name = "Wind Gust"
    lineOptions2.series[1].data = oWindgust
    lineOptions2.series[2].name = "Wind Direction"
    lineOptions2.series[2].data = []

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
    
    if (us.observationUnits.metricTemp)
        lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0C"
    if (us.observationUnits.metricSpeed)
        lineOptions2.yAxis.axisLabel.formatter = "{value} km/h"
            if (us.observationUnits.metricPressure){
                lineOptions3.yAxis.axisLabel.formatter = "{value} mb"
                lineOptions.grid.left = "8.2%"
                lineOptions2.grid.left = "8.2%"
                lineOptions3.grid.left = "8.2%"
            }


    var avgDir = 0
    var dirArray = []
    for(var x=0;x<= xData.length; x++){
    	if (x %6 == 0 && x > 0){
    		avgDir = Math.floor(avgDir / 6)
    		avgDir = 22.5 * Math.round(avgDir / 22.5)
       		if (avgDir == 22.5)
       			dirArray.push('nne')
    		else
       		if (avgDir == 45)
       			dirArray.push('ne')
    		else
       		if (avgDir == 67.5)
       			dirArray.push('ene')
    		else
       		if (avgDir == 90)
       			dirArray.push('e')
    		else
       		if (avgDir == 112.5)
       			dirArray.push('ese')
    		else
       		if (avgDir == 135)
       			dirArray.push('se')
    		else
       		if (avgDir == 157.5)
       			dirArray.push('sse')
    		else
       		if (avgDir == 180)
       			dirArray.push('s')
    		else
       		if (avgDir == 202.5)
       			dirArray.push('ssw')
    		else
       		if (avgDir == 225)
       			dirArray.push('sw')
    		else
       		if (avgDir == 247.5)
       			dirArray.push('wsw')
    		else
       		if (avgDir == 270)
       			dirArray.push('w')
    		else
       		if (avgDir == 292.5)
       			dirArray.push('wnw')
    		else
       		if (avgDir == 315)
       			dirArray.push('nw')
    		else
       		if (avgDir == 337.5)
       			dirArray.push('nnw')
    		else
       			dirArray.push('n')
       		avgDir = 0;
    	}
    	avgDir += oWinddir[x];
    }

    var chartVectors = [];
	var leftPosition = 80;
	var leftPositionIncrement = Math.floor((920 - leftPosition) / dirArray.length)
	for (x=0; x < dirArray.length; x++){
		var positionObj = {}
		positionObj.direction = dirArray[x];
		positionObj.left = leftPosition;
		chartVectors.push(positionObj)
		leftPosition+= leftPositionIncrement
	}
    

    res.render('charts',{chartvectors: chartVectors,loadstylesheet: true,data: JSON.stringify(lineOptions),data2: JSON.stringify(lineOptions2),data3: JSON.stringify(lineOptions3),skyconditions: makeSkyConditionsVector(),zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,rainStormRate: rainStormRate,moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
})
app.get('/chartrefresh', function (req, res) {
    res.locals.err = false;
    var xData = [" "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "];
    var hrStart = app.locals.moment(oDate[0]).format('HH')
    for (var x=0;x<oDate.length;x++){
    	if (app.locals.moment(oDate[x]).format('HH') != hrStart){
    		hrStart = app.locals.moment(oDate[x]).format('HH');
   			xData[x] = app.locals.moment(oDate[x]).format('ha');
    	}
    }
    xData = xData.slice(0,oDate.length)
    var fontColor = "#fff"
    if (daytime  && makeSkyConditionsVector()[0].skyconditions < 5)
    	fontColor = "#000"

    var lineOptions = clone(linechart);
    lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0F"
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
    lineOptions2.legend.data = ["Wind Speed","Wind Gust","Wind Direction"]
    lineOptions2.legend.textStyle.color = fontColor
    lineOptions2.xAxis.data = xData;
    lineOptions2.xAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.yAxis.axisLine.lineStyle.color = fontColor;
    lineOptions2.series[0].name = "Wind Speed"
    lineOptions2.series[0].data = oWindspd
    lineOptions2.series[1].name = "Wind Gust"
    lineOptions2.series[1].data = oWindgust
    lineOptions2.series[2].name = "Wind Direction"
    lineOptions2.series[2].data = []

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

    if (us.observationUnits.metricTemp)
        lineOptions.yAxis.axisLabel.formatter = "{value} \u00b0C"
    if (us.observationUnits.metricSpeed)
        lineOptions2.yAxis.axisLabel.formatter = "{value} km/h"
    if (us.observationUnits.metricPressure){
        lineOptions3.yAxis.axisLabel.formatter = "{value} mb"
        lineOptions.grid.left = "8.2%"
        lineOptions2.grid.left = "8.2%"
        lineOptions3.grid.left = "8.2%"
    }

    var avgDir = 0
    var dirArray = []
    for(var x=0;x<= xData.length; x++){
    	if (x %6 == 0 && x > 0){
    		avgDir = Math.floor(avgDir / 6)
    		avgDir = 22.5 * Math.round(avgDir / 22.5)
       		if (avgDir == 22.5)
       			dirArray.push('nne')
    		else
       		if (avgDir == 45)
       			dirArray.push('ne')
    		else
       		if (avgDir == 67.5)
       			dirArray.push('ene')
    		else
       		if (avgDir == 90)
       			dirArray.push('e')
    		else
       		if (avgDir == 112.5)
       			dirArray.push('ese')
    		else
       		if (avgDir == 135)
       			dirArray.push('se')
    		else
       		if (avgDir == 157.5)
       			dirArray.push('sse')
    		else
       		if (avgDir == 180)
       			dirArray.push('s')
    		else
       		if (avgDir == 202.5)
       			dirArray.push('ssw')
    		else
       		if (avgDir == 225)
       			dirArray.push('sw')
    		else
       		if (avgDir == 247.5)
       			dirArray.push('wsw')
    		else
       		if (avgDir == 270)
       			dirArray.push('w')
    		else
       		if (avgDir == 292.5)
       			dirArray.push('wnw')
    		else
       		if (avgDir == 315)
       			dirArray.push('nw')
    		else
       		if (avgDir == 337.5)
       			dirArray.push('nnw')
    		else
       			dirArray.push('n')
       		avgDir = 0;
    	}
    	avgDir += oWinddir[x];
    }
    var chartVectors = [];
	var leftPosition = 80;
	var leftPositionIncrement = Math.floor((920 - leftPosition) / dirArray.length)
	for (x=0; x < dirArray.length; x++){
		var positionObj = {}
		positionObj.direction = dirArray[x];
		positionObj.left = leftPosition;
		chartVectors.push(positionObj)
		leftPosition+= leftPositionIncrement
	}

    res.render('chartrefresh',{chartvectors: chartVectors,loadstylesheet: false,data: JSON.stringify(lineOptions),data2: JSON.stringify(lineOptions2),data3: JSON.stringify(lineOptions3),skyconditions: makeSkyConditionsVector(),zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,rainStormRate: rainStormRate,moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,day: daytime})
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
    res.render('testpattern',{observationUnits: us.observationUnits,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,moonsize: moonsize,lunarDetails: getLunarDetails(),sunrise: sunrise,sunset: sunset,directionObj: directionObj})
})

app.get('/settings', function (req, res) {
	res.locals.err = false;
	var IpAllowed = true;
 	if (us.mySettingsCIDR.length > 0){
	   var cidr = new ipcidr(us.mySettingsCIDR);
	   var ip = req.ip.substring(req.ip.lastIndexOf(':')+1)
	   if (cidr.contains(ip) || ip.length < 4)
		  IpAllowed = true
	   else
		  IpAllowed = false;
	}
	if (IpAllowed) 
		res.render('settings',{weatherSiteVersion: weatherSiteVersion,response: req.query.response,metricTemp: us.observationUnits.metricTemp,metricSpeed: us.observationUnits.metricSpeed,metricPressure: us.observationUnits.metricPressure, metricRain: us.observationUnits.metricRain,mySettingsCIDR: us.mySettingsCIDR,myClimacellApiKey: us.myClimacellApiKey,myMetarFilePath: us.myMetarFilePath,myMetarFtpSite: us.myMetarFtpSite,myWLLIp: us.myWLLIp,observationUnits: us.observationUnits,myRadarZoominPath: us.myRadarZoominPath,myRadarZoomoutPath: us.myRadarZoomoutPath,myLatitude: us.myLatitude,myLongitude: us.myLongitude,rainStormRate: rainStormRate,skyconditions: makeSkyConditionsVector(),day: daytime,zoominradarimage: us.myRadarZoominPath,zoomoutradarimage: us.myRadarZoomoutPath, loadstylesheet: true})
	else{
		var response = req.query.response
		if (response == null)
		   response = "Not authorized from your location"
		return res.redirect('/?response='+response);
	}

})
app.post('/dosettings', function (req, res) {
	var oldMetarFtpSite = us.myMetarFtpSite;
	var oldLatitude = us.myLatitude;
	var oldLongitude = us.myLongitude;
	var oldClimacellApiKey = us.myClimacellApiKey
	var oldWLLIp = us.myWLLIp;
	var oldMetricTemp = us.observationUnits.metricTemp;
	var oldMetricSpeed = us.observationUnits.metricSpeed;
	var oldMetricPressure = us.observationUnits.metricPressure;
	var oldMetricRain = us.observationUnits.metricRain;
	us.myLatitude = req.body.myLatitude.trim();
	us.myLongitude = req.body.myLongitude.trim();
	us.myWLLIp = req.body.myWLLIp.trim();
	us.myMetarFtpSite = req.body.myMetarFtpSite.trim();
	us.myMetarFilePath = req.body.myMetarFilePath.trim();
	us.myRadarZoominPath = req.body.myRadarZoominPath.trim();
	us.myRadarZoomoutPath = req.body.myRadarZoomoutPath.trim();
	us.myClimacellApiKey = req.body.myClimacellApiKey.trim();
	us.mySettingsCIDR = req.body.mySettingsCIDR.trim();
	temp=speed=pressure=rain=false;
	if (req.body.metricTemp == '1')
	   temp = true
	if (req.body.metricSpeed == '1')
	   speed = true
	if (req.body.metricPressure == '1')
	   pressure = true
	if (req.body.metricRain == '1')
	   rain = true
	us.observationUnits.metricTemp = temp;
	us.observationUnits.metricSpeed = speed;
	us.observationUnits.metricPressure = pressure;
	us.observationUnits.metricRain = rain
	localStorage.setItem("userSettings",JSON.stringify(us))
	if (oldWLLIp != us.myWLLIp)
		startWLLqueries();
	if (oldMetarFtpSite != us.myMetarFtpSite) // Metar data was set up
		startMETARqueries();
	if (oldClimacellApiKey != us.myClimacellApiKey)
	    startClimacellqueries();
	if (oldLatitude != us.myLatitude || oldLongitude != us.myLongitude){
	   var now = new Date();
	   var obj = suncalc.getTimes(now,us.myLatitude,us.myLongitude)
	   if ((now > obj.dusk && now > obj.dawn) || (now < obj.dawn && now < obj.dusk))
		   daytime = 0;
	   else
		   daytime = 1;
	   sunrise = obj.sunrise;
	   sunset = obj.sunset;
	   moonsize = makeMoonPhaseVector();
	}
	if (oldMetricTemp != us.observationUnits.metricTemp || oldMetricSpeed != us.observationUnits.metricSpeed || oldMetricPressure != us.observationUnits.metricPressure || oldMetricRain != us.observationUnits.metricRain){
		oDate = [];
		oTemp = [];
		oHum = [];
		oDewpt = [];
		oWindspd = [];
		oWinddir = [];
		oWindgust = [];
		oBarometer = [];
		localStorage.removeItem("oDate");
		localStorage.removeItem("oTemp");
		localStorage.removeItem("oHum");
		localStorage.removeItem("oDewpt");
		localStorage.removeItem("oWinsdspd");
		localStorage.removeItem("oWinddir");
		localStorage.removeItem("oWindguest");
		localStorage.removeItem("oBarometer");
		startWLLqueries();
	}
	return(res.redirect('/settings?response=Settings Updated'))
})

//Find my WLL if necessary and start WLL queries
if (us.myWLLIp.length == 0)
    findWLL();
else{
    console.log("Attached to WLL at "+us.myWLLIp)
	startWLLqueries();
}
//Start Metar Queries if set up
if (us.myMetarFtpSite.length > 0)
    startMETARqueries()

// Start Climacell forecasts if set up
if (us.myClimacellApiKey.length > 0){
   startClimacellqueries()
}

//UDP Server

var server = udp.createSocket('udp4'); 
server.bind(22222);

server.on('listening',function(){
  var address = server.address();
  var port = address.port;
  console.log('UDP Server is listening at port ' + port);
});
server.on('message',function(msg,info){
	  //console.log(msg.toString());
	  if (info.address != us.myWLLIp) // drop foreign broadcasts
		  return
	  var wndOcc = 0;
	  var rainOcc = 0;
	  var obj = JSON.parse(msg);
	  if (wndOccurrence == null)  // look for wind device
		  for(var x = 0;x<obj.conditions.length;x++)
		    if(obj.conditions[x].wind_dir_at_hi_speed_last_10_min > 0){
				wndOccurrence = x;
				console.log("Wind sensor array found on Device ID "+obj.conditions[x].txid)
				break
			}
	  if (rainOccurrence == null)  // look for rain device
		  for(var x = 0;x<obj.conditions.length;x++)
		    if(obj.conditions[x].rainfall_year > 0){
				rainOccurrence = x;
				console.log("Rain sensor array found on Device ID "+obj.conditions[x].txid)
				break
			}
	  if (wndOccurrence != null)
		 wndOcc = wndOccurrence;
	  if (rainOccurrence != null)
	     rainOcc = rainOccurrence;
	  direction=obj.conditions[wndOcc].wind_dir_last;
	  if (direction != lastDirection){
	     lastDirection3 = lastDirection2;
	     lastDirection2 = lastDirection1;
	     lastDirection1 = lastDirection;
	     lastDirection = direction;
      }
	  speed=Math.round(obj.conditions[wndOcc].wind_speed_last);
	  if (us.observationUnits.metricSpeed)
		  speed = Math.round(speed * 1.60934)
	  gustDirection=obj.conditions[wndOcc].wind_dir_at_hi_speed_last_10_min;
	  gustSpeed=Math.round(obj.conditions[wndOcc].wind_speed_hi_last_10_min);
	  if (us.observationUnits.metricSpeed)
		  gustSpeed = Math.round(gustSpeed * 1.60934)
	  //rainStormStart='1603243501';
	  rainStormStart=obj.conditions[rainOcc].rain_storm_start_at
	  if (us.observationUnits.metricRain){
		  rainStormAmt=(obj.conditions[rainOcc].rain_storm *.2).toFixed(2);
		  rainStormRate=(obj.conditions[rainOcc].rain_rate_last *.2).toFixed(2);
		  
	  }
	  else{
	      rainStormAmt=(obj.conditions[rainOcc].rain_storm *.01).toFixed(2);
	      rainStormRate=(obj.conditions[rainOcc].rain_rate_last *.01).toFixed(2)
	  }
	  if (rainStormStart == null){
		  rainStormStart = ''
	  }
	  else{
		  rainStormStart = app.locals.moment.unix(rainStormStart).format('MMM D, h:mm a')
	  }
});



// test code: make it night in 30 seconds
/*
setTimeout(function(){
	daytime = 0
}, 30*1000)
*/

// periodically determine day/night and moon phase

setInterval(function(){
	var now = new Date();
	var obj = suncalc.getTimes(now,us.myLatitude,us.myLongitude)
	if ((now > obj.dusk && now > obj.dawn) || (now < obj.dawn && now < obj.dusk))
		daytime = 0;
	else
		daytime = 1;
	sunrise = obj.sunrise;
	sunset = obj.sunset;
	moonsize = makeMoonPhaseVector();
}, 10*60*1000); 

//Start up  Web server
var arg3 = ''
if (us.myWLLIp.length == 0)
	arg3 = 'Searching for WLL'
else
   arg3 = "WLL is "+us.myWLLIp	

const wsServer = http.createServer(app).listen(app.get('port'), function(){
    console.log("\nWeathersite v"+weatherSiteVersion+" is online at "+myUrl+'\n');
	spawn('python3',[__dirname+'/pidisplay.py','Weathersite is Online',myIpAddress+':5000',arg3]).on('error',function(){}); //toss error
});

process.on('SIGTERM', () => {
  wsServer.close(() => {
    console.log('Process terminated')
  })
})


