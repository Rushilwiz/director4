$(function() {
    $(window).resize(function() {
        $(".console-wrapper").trigger("terminal:resize");
    });
});

function setupTerminal(uri, wrapper, options) {
    options = options || {};
    var titleCallback = options.onTitle || function(title) {
        document.title = title;
    };

    var heartbeat_interval = 90 * 1000;

    var ws = null;
    var connected = false;
    var dataReceived = false;

    wrapper.empty().addClass("console-wrapper");

    var container = $("<div>").addClass("console-container").appendTo(wrapper);
    $("<div>").addClass("console-disconnect").appendTo(wrapper).append(
        "Disconnected ",
        $("<a>").addClass("console-reconnect").attr("href", "#").text("Reconnect").click(openWS),
    );

    var term = new Terminal({cursorBlink: true});
    var fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    term.onData(function(data) {
        if(ws != null && connected && dataReceived) {
            ws.send(new Blob([data]));
        }
    });
    term.onResize(function(size) {
        updateSize(size.rows, size.cols);
    });
    term.onTitleChange(titleCallback);

    wrapper.on("terminal:resize", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if(connected && dataReceived) {
            if(container.is(":visible")) {
                term.resize(0, 0);
                fitAddon.fit();
            }
        }
    });

    function updateSize(rows, cols) {
        if(ws != null && connected && dataReceived) {
            ws.send(JSON.stringify({"size": [rows, cols]}));
        }
    }

    var termOpen = false;

    function openWS() {
        if(!termOpen) {
            termOpen = true;
            term.open(container.get(0), true);
            if(options.autoFocus) {
                term.focus();
            }

            var fitInterval = setInterval(function() {
                if(container.is(":visible")) {
                    fitAddon.fit();
                    clearInterval(fitInterval);
                }
            }, 500);
        }

        term.reset();
        term.clear();
        term.setOption("disableStdin", true);
        term.setOption("cursorBlink", false);
        term.write("Connecting...");

        wrapper.removeClass("disconnected");

        connected = false;
        dataReceived = false;

        ws = new WebSocket(uri);
        ws.onopen = onOpen;
        ws.onmessage = onMessage;
        ws.onclose = onClose;
    }

    function onOpen() {
    }

    function firstReceivedResponse() {
        connected = true;

        term.reset();
        term.clear();
        term.write("\rLaunching terminal...");

        wrapper.removeClass("disconnected");
    }

    function firstReceivedData() {
        wrapper.removeClass("disconnected");

        term.setOption("disableStdin", false);
        term.setOption("cursorBlink", true);

        if(options.autoFocus) {
            term.focus();
        }
        term.reset();
        term.clear();

        updateSize(term.rows, term.cols);
        setTimeout(function() {
            updateSize(term.rows, term.cols);
        }, 0);

        dataReceived = true;
    }

    function onMessage(e) {
        var data = e.data;

        if(data instanceof Blob) {
            if(!dataReceived) {
                firstReceivedData();
            }

            data.text().then((text) => {
                term.write(text);
            });
        }
        else if(data instanceof ArrayBuffer) {
            if(!dataReceived) {
                firstReceivedData();
            }

            term.write(new Uint8Array(data));
        }
        else {
            var data = JSON.parse(data);

            if(!connected && data.connected == true) {
                firstReceivedResponse();
            }
            else if(data.heartbeat != null) {
                // A reply to our heartbeat message; ignore
            }
        }
    }

    setInterval(function() {
        if(ws != null && connected && dataReceived) {
            ws.send(JSON.stringify({"heartbeat": 1}));
        }
    }, heartbeat_interval);

    function onClose() {
        if(dataReceived) {
            term.setOption("disableStdin", true);
            term.setOption("cursorBlink", false);
        }
        else {
            term.reset();
            term.clear();
        }

        connected = false;
        dataReceived = false;

        wrapper.focus();
        wrapper.addClass("disconnected");

        titleCallback("Terminal");
    }

    setTimeout(openWS, 0);

    return {
        term: term,
        updateSettings: function(settings) {
            term.setOption("fontSize", settings["terminal-font-size"]);
        },
    };
}
