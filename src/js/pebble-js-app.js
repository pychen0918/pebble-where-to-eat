var g_query_type;  // 0: list, 1: detail
var g_query_uid;

var g_option_range;
var g_option_type;
var g_option_opennow;
var g_option_price;
var g_option_unit;

var g_range_text = ["500", "1000", "5000", "10000", "805", "1610", "8050", "16100"];
var g_type_text = ["food", "restaurant", "cafe", "bar", "convenience_store", "meal_delivery", "meal_takeaway"];
var g_price_text = ["", "&maxprice=1&minprice=1", "&maxprice=2&minprice=2", "&maxprice=3&minprice=3", "&maxprice=4&minprice=4"];
var g_opennow_text = ["", "&opennow"];

// This key has been revoked. Use the true API key for test.
var api_key = "AIzaSyDIRnvHHyGijXLZPAP9VZKb15EkB6oPI9s";

// Query status code that need to send back to pebble
var status_code = {
	success : 0,
	no_result : 1, 
	timeout : 2, 
	api_error : 3
};
var list_first_key = 30;

function xhrRequest(url, type, callback) {
	var xhr = new XMLHttpRequest();
	xhr.onload = function () {
		callback(this.responseText);
	};	
	xhr.open(type, url);
	xhr.send();
};

// Calculate distance by using approximation
function getDistance(lat1, lon1, lat2, lon2) {
	var R, a, b;

	if(g_option_unit == 0)
		R = 6731009;	// earth radius in meters
	else
		R = 4182.455;	// earth radius in miles
	a = (lat1 - lat2)*(Math.PI / 180);
	b = Math.cos((lat1+lat2)*(Math.PI/180)/2) * (lon1 - lon2)*(Math.PI/180);

	if(g_option_unit == 0)
		return Math.round((R * Math.sqrt( a*a + b*b ))/10)*10;  // roundup the number to 10 meters
	else
		return Math.round(R * Math.sqrt( a*a + b*b ) * 100);
		
}

// Calculate direction. 
// (lat1, lon1) is current position, and (lat2, lon2) is target position
function getDirection(lat1, lon1, lat2, lon2) {
	var t = Math.atan2(lon2-lon1, lat2-lat1)*(180/Math.PI);
	var index = Math.round(t / 45);
	if(index < 0)
		index = index+8;

	return index;
}

function locationSuccess(pos){
	var url;
	if(g_query_type == 0){  // list
		url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?" +
			"location=" + pos.coords.latitude + "," + pos.coords.longitude +
			"&radius=" + g_range_text[g_option_range] + 
			"&types=" + g_type_text[g_option_type] +
			g_opennow_text[g_option_opennow] +
			g_price_text[g_option_price] +
			"&key=" + api_key;
	} 
	else if(g_query_type == 1){ // detail
		url = "https://maps.googleapis.com/maps/api/place/details/json?" + 
			"placeid=" + g_place_id +
			"&key=" + api_key;
	}
	else {
		console.log("Unknown query type: " + g_query_type + "!");
		// in this case, we send list query
		g_query_type = 0;
		url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?" +
			"location=" + pos.coords.latitude + "," + pos.coords.longitude +
			"&radius=" + g_range_text[g_option_range] + 
			"&types=" + g_type_text[g_option_type] +
			g_opennow_text[g_option_opennow] +
			g_price_text[g_option_price] +
			"&key=" + api_key;
	}
	console.log("url: " + url);

	xhrRequest(url, 'GET',
		function(responseText) {
			var json;
			var i, key;
			var dictionary = {};
			var distance, lat, lon, direction, place_id;
			var address, phone, rating;
			
			try{
				json = JSON.parse(responseText);

				// always set these fields
				dictionary['query_uid'] = g_query_uid;
				dictionary['query_type'] = g_query_type;

				// Case 1: No result, we can remind user to change search conditions
				if(json.status == "ZERO_RESULTS"){
					console.log("[ERROR] status: "+json.status);
					dictionary['status'] = status_code['no_result'];
				}
				// Case 2: Other error, like OVER_QUERY_LIMIT, REQUEST_DENIED or INVALID_REQUEST
				// We call them "api_error" and add google's response in error_message
				// This will show to users
				else if(json.status != 'OK' ){
					console.log("[ERROR] status: "+json.status);
					dictionary['status'] = status_code['api_error'];
					dictionary['query_type'] = g_query_type;
					dictionary['error_message'] = json.status + " " + json.error_message;
				}
				// Case 3: Success, google gave us "OK"
				// We can parse the data now
				else{
					if(g_query_type == 0){ // list
						key = list_first_key;
						for(i in json.results){
							console.log("i = " + i);
							lat = json.results[i].geometry.location.lat;
							lon = json.results[i].geometry.location.lng;
							place_id = json.results[i].place_id;
							distance = getDistance(pos.coords.latitude, pos.coords.longitude, lat, lon);
							direction = getDirection(pos.coords.latitude, pos.coords.longitude, lat, lon);
							console.log(" key: " + key + 
								    " name: " + json.results[i].name + 
								    " direction: " + direction + 
								    " distance: " + distance +
								    " place_id: " + place_id);
							dictionary[key] = json.results[i].name + "|" + direction + "|" + distance + "|" + place_id;
							key++;
						}
						if(key == list_first_key)  // didn't get any result
							dictionary['status'] = status_code['no_result'];
						else
							dictionary['status'] = status_code['success'];
					}
					else if(g_query_type == 1){ // detail
						var phone, address, rating;
						dictionary['query_place_id'] = json.result.place_id;
						phone = json.result.formatted_phone_number;
						address = json.result.formatted_address;
						rating = Math.round(json.result.rating);

						if(isNaN(rating))
							dictionary['detail_rating'] = 0;
						else
							dictionary['detail_rating'] = Math.round(json.result.rating);
						if(typeof(address) == 'undefined')
							dictionary['detail_address'] = "";
						else
							dictionary['detail_address'] = address;
						if(typeof(phone) == 'undefined')
							dictionary['detail_phone'] = "";
						else
							dictionary['detail_phone'] = phone;

						dictionary['status'] = status_code['success'];
						console.log("name: "+json.result.name + 
							" phone: "+dictionary['detail_phone'] +
							" place_id:"+dictionary['query_place_id']+
							" rating: "+dictionary['detail_rating']+
							" address: "+dictionary['detail_address']);
					}
				}
			} 
			catch(e){
				// Case 4: Any error while parsing returned data
				// We still call it "api_error" and send message back
				// This will show to user 
				console.log("[Error]: " + e.message + "; while parsing response: ");
				console.log(responseText);
				dictionary['status'] = status_code['api_error'];
				dictionary['query_uid'] = g_query_uid;
				dictionary['query_type'] = g_query_type;
				dictionary['error_message'] = e.message;
			}

			// Send to Pebble
			Pebble.sendAppMessage(dictionary,
				function(e) {
					console.log("List sent to Pebble successfully!");
				},
				function(e) {
					console.log("Error sending list info to Pebble!");
				}
			);
		}
	);
}

function locationError(err){
	var dictionary = {};
	//console.log("Location error: code=" + err.code + " msg=" + err.message);
	dictionary['status'] = status_code['timeout'];
	dictionary['query_uid'] = g_query_uid;
	dictionary['query_type'] = g_query_type;
	Pebble.sendAppMessage(dictionary,
		function(e) {
			console.log("Timeout: List sent to Pebble successfully!");
		},
		function(e) {
			console.log("Timeout: Error sending list info to Pebble!");
		}
	);
}


function getLocation() {
	navigator.geolocation.getCurrentPosition(
		locationSuccess,
		locationError,
		{
			enableHighAccuracy: false, 
			timeout: 20000, 
			maximumAge: 60000
		}
	);
}

Pebble.addEventListener("ready",
	function(e) {
		console.log("Ready");
	}
);

Pebble.addEventListener("appmessage",
	function(e) {
		g_query_type = e.payload['query_type'];
		g_query_uid = e.payload['query_uid'];
		console.log("e.payload['query_type']="+e.payload['query_type']+" e.payload['query_uid']="+e.payload['query_uid']);
		if(g_query_type == 0){ // list
			g_option_range = e.payload['query_option_range'];
			g_option_type = e.payload['query_option_type'];
			g_option_opennow = e.payload['query_option_opennow'];
			g_option_price = e.payload['query_option_price'];
			if(g_option_range < 4)
				g_option_unit = 0;
			else
				g_option_unit = 1;
			getLocation();
		}
		else if(g_query_type == 1){ // detail
			g_place_id = e.payload['query_place_id'];
			getLocation();
		}
		else{ // unknown query type
			console.log("Unknown query type");
			var error = {};
			error['status'] = status_code['api_error'];
			Pebble.sendAppMessage(error,
				function(e) {
					console.log("List sent to Pebble successfully!");
				},
				function(e) {
					console.log("Error sending list info to Pebble!");
				}
			);
		}	
	}
);
