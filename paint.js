"use strict";


//element creation helper function
function elt(name, attributes) {
	var node = document.createElement(name);
	if (attributes) {
		for (var attr in attributes) {
			if (attributes.hasOwnProperty(attr)) {
				node.setAttribute(attr, attributes[attr]);
			}
		}
	}
	for (var i = 2, len = arguments.length; i < len; i++) {
		var child = arguments[i];
		if (typeof child === "string") {
			child = document.createTextNode(child);
		}
		node.appendChild(child);
	}
	return node;
}




var controls = Object.create(null);

function createPaint(parent) {
	var canvas = elt("canvas");
	canvas.width  = window.innerWidth / 1.1;
  canvas.height = window.innerHeight / 1.2;
	var cx = canvas.getContext("2d");
	var toolbar = elt("div", {class: "toolbar"});
	for (var name in controls) {
		toolbar.appendChild(controls[name](cx));
	}

	var panel = elt("div", {class: "picturepanel"}, canvas);
	parent.appendChild(elt("div", null, panel, toolbar));
}



//create tool selection box, fill with options created
var tools = Object.create(null);

controls.tool = function(cx) {
	var select = elt("select");
	for (var name in tools) {
		select.appendChild(elt("option", null, name));
	}

	cx.canvas.addEventListener("mousedown", function(event) {
		if (event.which === 1) {
			tools[select.value](event,cx);
			event.preventDefault();
		}
	});
	return elt("span", null, "Tool: ", select);
};


//color selection
controls.color = function(cx) {
	var input = elt("input", {type: "color"});
	input.addEventListener("change", function() {
		cx.fillStyle = input.value;
		cx.strokeStyle = input.value;
	});
	return elt("span", null, "Color: ", input);
};


//brush size selection
controls.brushSize = function(cx) {
	var select = elt("select");
	var sizes = [1, 2, 3, 5, 8, 12, 25, 35, 50, 75, 100];
	sizes.forEach(function(size) {
		select.appendChild(elt("option", {value: size}, size + " pixels"));
	});
	select.addEventListener("change", function() {
		cx.lineWidth = select.value;
	});
	return elt("span", null, "Brush size: ", select);
};


//save image as dataurl (on mouseover and/or focus)   
controls.save = function(cx) {
	var link = elt("a", {href: "/"}, "Save");
	function update() {
		try {
			link.href = cx.canvas.toDataURL();
		}
		catch (e) {
			if (e instanceof SecurityError) {
				link.href = "javascript:alert(" + JSON.stringify("Can't save: " + e.toString()) + ")";
			}
			else throw e;
		}
	}
	link.addEventListener("mouseover", update);
	link.addEventListener("focus", update);
	return link;
};


controls.openFile = function(cx) {
	var input = elt("input", {type: "file"});
	input.addEventListener("change", function() {
		if (input.files.length === 0) return;
		var reader = new FileReader();
		reader.addEventListener("load", function() {
			loadImageURL(cx, reader.result);
		});
		reader.readAsDataURL(input.files[0]);
	});
	return elt("div", null, "Open file: ", input);
};


controls.openURL = function(cx) {
	var input = elt("input", {type: "text"});
	var form = elt("form", null, "Open URL: ", input, elt("button", {type: "submit"}, "load"));
	form.addEventListener("submit", function(event) {
		event.preventDefault();
		loadImageURL(cx, form.querySelector("input").value);
	});
	return form;
};


//load from url (change canvas size to fit image and reload cx values)
function loadImageURL(cx, url) {
	var image = document.createElement("img");
	image.addEventListener("load", function() {
		var color = cx.fillStyle, size = cx.lineWidth;
		cx.canvas.width = image.width;
		cx.canvas.height = image.height;
		cx.drawImage(image, 0, 0);
		cx.fillStyle = color;
		cx.strokeStyle = color;
		cx.lineWidth = size;
	});
	image.src = url;
}






//get position in canvas
function relativePos(event, element) {
	var rect = element.getBoundingClientRect();
	return {x: Math.floor(event.clientX - rect.left),
	        y: Math.floor(event.clientY - rect.top)};
}


//keep track of mouse being held down and call onMove and onEnd functions at appropriate times
function trackDrag(onMove, onEnd) {
	function end(event) {
		removeEventListener("mousemove", onMove);
		removeEventListener("mouseup", end);
		if (onEnd) {
			onEnd(event);
		}
	}
	addEventListener("mousemove", onMove);
	addEventListener("mouseup", end);
}






//line tool
tools.Line = function(event, cx, onEnd) {
	cx.lineCap = "round";

	var pos = relativePos(event, cx.canvas);
	trackDrag(function(event) {
		cx.beginPath();
		cx.moveTo(pos.x, pos.y);
		pos = relativePos(event, cx.canvas);
		cx.lineTo(pos.x, pos.y);
		cx.stroke();
	}, onEnd);
};

//erase tool built on line tool:
tools.Erase = function(event, cx) {
	cx.globalCompositeOperation = "destination-out"; //has effect of erasing pixels
	tools.Line(event, cx, function() {
		cx.globalCompositeOperation = "source-over"; //back to normal pixel drawing
	});
};

//very basic text tool
tools.Text = function(event, cx) {
	var text = prompt("Text:", "");
	if (text) {
		var pos = relativePos(event, cx.canvas);
		cx.font = Math.max(7, cx.lineWidth) + "px sans-serif";
		cx.fillText(text, pos.x, pos.y);
	}
};

//typical spray tool
tools.Spray = function(event, cx) {
	var radius = cx.lineWidth / 2;
	var area = radius * radius * Math.PI;
	var dotsPerTick = Math.ceil(area / 30);

	var currentPos = relativePos(event, cx.canvas);
	var spray = setInterval(function() {
		for (var i = 0; i < dotsPerTick; i++) {
			var offset = randomPointInRadius(radius);
			cx.fillRect(currentPos.x + offset.x, currentPos.y + offset.y, 1, 1);
		}
	}, 25);
	trackDrag(function(event) {
		currentPos = relativePos(event, cx.canvas);
	}, function() {
		clearInterval(spray);
	});
};

function randomPointInRadius(radius) {
	for (;;) {
		var x = Math.random() * 2 - 1;
		var y = Math.random() * 2 - 1;
		if (x * x + y * y <= 1) {
			return {x: x * radius, y: y * radius};
		}
	}
}

//filled rectangle tool
tools.Rectangle = function(event, cx) {
	var relativeStart = relativePos(event, cx.canvas);
	var pageStart = {x: event.pageX, y: event.pageY};

	var trackingNode = document.createElement("div");
	trackingNode.style.position = "absolute";
	trackingNode.style.background = cx.fillStyle;
	document.body.appendChild(trackingNode);

	trackDrag(function(event){
		var rect = rectangleFrom(pageStart, {x: event.pageX, y: event.pageY});
		trackingNode.style.left = rect.left + "px";
		trackingNode.style.top = rect.top + "px";
		trackingNode.style.width = rect.width + "px";
		trackingNode.style.height = rect.height + "px";
  }, function(event) {
  	var rect = rectangleFrom(relativeStart, relativePos(event, cx.canvas));
    cx.fillRect(rect.left, rect.top, rect.width, rect.height);
    document.body.removeChild(trackingNode);
	});
};

function rectangleFrom(a, b) {
  return {left: Math.min(a.x, b.x),
          top: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y)};
}


//random empty circles tool
tools.Bubbles = function(event, cx) {
	var setFill = cx.fillStyle;
	var setSize = cx.lineWidth; //save it to use for radius expression and to reset at end
	trackDrag(function(event) {
		var pos = relativePos(event, cx.canvas);
		var radius = Math.random() * (setSize + 1) + 1;
		cx.beginPath();
		cx.lineWidth = 2; //(because of this)
		cx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
		cx.stroke();
		cx.fillStyle = "white";
		cx.fill();
	}, function(event) {
		cx.lineWidth = setSize;
		cx.fillStyle = setFill;
	});
};

//random filled circles tool
tools.Blobs = function(event, cx) {
	var setSize = cx.lineWidth; 
	trackDrag(function(event) {
		var pos = relativePos(event, cx.canvas);
		var radius = Math.random() * (setSize + 1) + 1;
		cx.beginPath();
		cx.arc(pos.x, pos.y, radius / 3, 0, Math.PI * 2);
		cx.globalAlpha = Math.random() / 2;
		cx.fill();
		cx.beginPath();
		cx.arc(pos.x + Math.random() * 10, pos.y + Math.random() * 10, radius / 2, 0, Math.PI * 2);
		cx.globalAlpha = Math.random() / 4;
		cx.fill();
		cx.beginPath();
		cx.arc(pos.x - Math.random() * 10, pos.y - Math.random() * 10, radius / 2, 0, Math.PI * 2);
		cx.globalAlpha = Math.random() / 4;
		cx.fill();
		cx.beginPath();
		cx.arc(pos.x + Math.random() * 10, pos.y - Math.random() * 10, radius / 2, 0, Math.PI * 2);
		cx.globalAlpha = Math.random() / 4;
		cx.fill();
		cx.beginPath();
		cx.arc(pos.x - Math.random() * 10, pos.y + Math.random() * 10, radius / 2, 0, Math.PI * 2);
		cx.globalAlpha = Math.random() / 4;
		cx.fill();
	}, function(event) {
		cx.lineWidth = setSize;
		cx.globalAlpha = 1;
	});
};

//randomized line tool (only looks good for smaller line widths)
tools["Broken Line"] = function(event, cx, onEnd) {
	cx.lineCap = "butt";

	var pos = relativePos(event, cx.canvas);
	trackDrag(function(event) {
		cx.beginPath();
		cx.moveTo(pos.x + Math.random() * 9 - 4, pos.y + Math.random() * 9 - 4);
		pos = relativePos(event, cx.canvas);
		cx.lineTo(pos.x + Math.random() * 9 - 4, pos.y + Math.random() * 9 - 4);
		cx.stroke();
	}, onEnd);
};

//radiating lines tool
tools.Radiate = function(event, cx) {
  cx.lineCap = "round";
  var setWidth = cx.lineWidth;
  trackDrag(function(event) {
  	cx.lineWidth = 1;
  	for (var i = 0; i < 5; i++) {
     	cx.beginPath();
     	var pos = relativePos(event, cx.canvas);
  		cx.moveTo(pos.x, pos.y);
  		cx.lineTo(pos.x + Math.cos(Math.random() * Math.PI * 2) * setWidth,
  		          pos.y + Math.sin(Math.random() * Math.PI * 2) * setWidth);
  		cx.globalAlpha = Math.random() / 2;
  		cx.stroke();
  	}
  }, function() {
    cx.lineWidth = setWidth;
    cx.globalAlpha = 1;
  });
};

//rainbow line tool
tools["Rainbow Line"] = function(event, cx) {
	cx.lineCap = "round";
  var setColor = cx.strokeStyle;
  var hue = 0;
  var pos = relativePos(event, cx.canvas);
	trackDrag(function(event) {
		cx.beginPath();
		cx.moveTo(pos.x, pos.y);
		pos = relativePos(event, cx.canvas);
		cx.lineTo(pos.x, pos.y);
		cx.strokeStyle = "hsla(" + hue + ", 50%, 50%, 0.5)";
		cx.stroke();
		hue += 5;
	}, function() {
    cx.strokeStyle = setColor;
	});
};

//downward triangle shapes
tools.Icicles = function(event, cx) {
	cx.lineCap = "round";
  var setWidth = cx.lineWidth;
	var pos = relativePos(event, cx.canvas);
	cx.lineWidth = 1;
	cx.globalAlpha = 0.4;
	trackDrag(function(event) {
		cx.beginPath();
		cx.moveTo(pos.x, pos.y);
		pos = relativePos(event, cx.canvas);
		cx.lineTo(pos.x, pos.y + setWidth * Math.random() * 5);
		cx.lineTo(pos.x, pos.y);
		cx.fill();
	}, function() {
    cx.lineWidth = setWidth;
    cx.globalAlpha = 1;
	});
};

//weird jagged line
tools.Jagged = function(event, cx) {
	cx.lineCap = "round";
  var setWidth = cx.lineWidth;
	var pos = relativePos(event, cx.canvas);
	var setColor = cx.fillStyle;
	cx.lineWidth = 1;
	trackDrag(function(event) {
		cx.beginPath();
		cx.moveTo(pos.x, pos.y);
		pos = relativePos(event, cx.canvas);
		cx.lineTo(pos.x + Math.random() * setWidth * 2 - setWidth, pos.y);
		cx.stroke();
		cx.lineTo(pos.x + Math.random() * setWidth * 2 - setWidth, pos.y + Math.random() * setWidth * 2 - setWidth);
		cx.stroke();
		cx.lineTo(pos.x, pos.y + Math.random() * setWidth * 2 - setWidth);
		cx.stroke();
		cx.lineTo(pos.x, pos.y);
		cx.stroke();
		//cx.fillStyle = "white";
		
	}, function() {
    cx.lineWidth = setWidth;
    cx.globalAlpha = 1;
	});
};










createPaint(document.body);