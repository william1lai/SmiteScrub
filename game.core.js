
var frame_time = 60/1000; // run the local game at 16ms/ 60hz
if('undefined' != typeof(global)) frame_time = 45; //on server we run at 45ms, 22hz

( function () {

    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];

    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
        window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
        window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
    }

    if ( !window.requestAnimationFrame ) {
        window.requestAnimationFrame = function ( callback, element ) {
            var currTime = Date.now(), timeToCall = Math.max( 0, frame_time - ( currTime - lastTime ) );
            var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if ( !window.cancelAnimationFrame ) {
        window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
    }

}() );

/* The game_core class */

    var game_core = function(game_instance) {

        this.instance = game_instance;
        this.server = this.instance !== undefined;

        this.world = {
            width : 720,
            height : 480
        };
        this.input_seq = 0;
        this.hp = 5000;
        this.smite_dmg = 1000;
        this.decay = 10;

        if(this.server) {
            this.players = {
                self : new game_player(this,this.instance.player_host),
                other : new game_player(this,this.instance.player_client)
            };
        } else {
            this.players = {
                self : new game_player(this),
                other : new game_player(this)
            };
        }

        this.local_time = 0.016;            //The local timer
        this._dt = new Date().getTime();    //The local timer delta
        this._dte = new Date().getTime();   //The local timer last frame time

        this.create_timer();

        if(!this.server) {

            this.keyboard = new THREEx.KeyboardState();
            this.client_create_configuration();
            this.server_updates = [];
            this.client_connect_to_server();
            this.client_create_ping_timer();
            this.color = localStorage.getItem('color') || '#cc8822' ;
            localStorage.setItem('color', this.color);
            this.players.self.color = this.color;

            if(String(window.location).indexOf('debug') != -1) {
                this.client_create_debug_gui();
            }

        } else { //if !server
            this.server_time = 0;
            this.laststate = {};
        }

    }; //game_core.constructor

//server side we set the 'game_core' class to a global type, so that it can use it anywhere.
if( 'undefined' != typeof global ) {
    module.exports = global.game_core = game_core;
}

/*
    Helper functions for the game code
*/
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
game_core.prototype.pos = function(a) { return {x:a.x,y:a.y}; };
game_core.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
game_core.prototype.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
game_core.prototype.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
game_core.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
game_core.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
game_core.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };

/*
    The player class
*/

    var game_player = function( game_instance, player_instance ) {

        this.instance = player_instance;
        this.game = game_instance;

        this.state = 'not-connected';
        this.id = '';
        this.smite_used = false;
        this.score = 0;

        this.state_time = new Date().getTime();

        this.inputs = [];

    }; //game_player.constructor

        
    game_player.prototype.draw = function() {

        if (!this.server)
        {
            game.ctx.fillStyle = this.color;
            game.ctx.font = "30 px verdana";
            if (this.game.hp <= 0)
                game.ctx.fillText("0", 320, 240);
            else
                game.ctx.fillText(this.game.hp.toString(), 320, 240);
            game.ctx.fillText("Score: " + this.score.toString(), 320, 10);
        }
        else
        {
            console.log("server entered draw function");
        }
    
    }; //game_player.draw
 

/*
 Common functions
*/

game_core.prototype.update = function(t) {
    
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;

    this.lastframetime = t;

    if(!this.server) {
        this.hp = this.hp - this.decay;
        this.client_update();
    } else {
        if (this.hp < this.instance.hp)
            this.instance.hp = this.hp;
        this.instance.hp = this.instance.hp - this.decay;
        console.log("server hp: " + this.instance.hp);
        this.server_update();
        if (this.instance.hp <= 0)
        {
            console.log("Game ended");
            this.server.endGame(this.instance.id);
        }
    }

    this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );

}; //game_core.update


game_core.prototype.process_input = function( player ) {

    var ic = player.inputs.length;
    if(ic) {
        for(var j = 0; j < ic; ++j) {
            if(player.inputs[j].seq <= player.last_input_seq) continue;

            var input = player.inputs[j].inputs;
            var c = input.length;
            for(var i = 0; i < c; ++i) {
                var key = input[i];
                //console.log(key + " was pressed");
                if(key == 's' && !player.smite_used) {
                    this.hp = this.hp - this.smite_dmg;
                    player.smite_used = true;
                    if (this.hp <= 0)
                    {
                        player.score = this.hp + this.smite_dmg;
                    }
                    console.log("hp is now " + this.hp);
                }
            } //for all input values
        } //for each input command
    } //if we have inputs

    if(player.inputs.length) {
        player.last_input_time = player.inputs[ic-1].time;
        player.last_input_seq = player.inputs[ic-1].seq;
    }
}; //game_core.process_input


/*
 Server side functions
*/

game_core.prototype.server_update = function(){

    this.server_time = this.local_time;

    this.laststate = {
        hp  : this.hp,
        his : this.players.self.last_input_seq,   
        cis : this.players.other.last_input_seq, 
        t   : this.server_time                  
    };
    
    if(this.players.self.instance) {
        this.players.self.instance.emit( 'onserverupdate', this.laststate );
    }

    if(this.players.other.instance) {
        this.players.other.instance.emit( 'onserverupdate', this.laststate );
    }

}; //game_core.server_update


game_core.prototype.handle_server_input = function(client, input, input_time, input_seq) {
    
    console.log('got input ' + input);

    var player_client =
        (client.userid == this.players.self.instance.userid) ?
            this.players.self : this.players.other;

   player_client.inputs.push({inputs:input, time:input_time, seq:input_seq});

}; //game_core.handle_server_input


/*
 Client side functions
*/

game_core.prototype.client_handle_input = function(){

    var input = [];
    this.client_has_input = false;

    if( this.keyboard.pressed('D') ||
        this.keyboard.pressed('F')) {
            input.push('s');
        } //smite

    if(input.length) {

        this.input_seq += 1;

        this.players.self.inputs.push({
            inputs : input,
            time : this.local_time.fixed(3),
            seq : this.input_seq
        });

        var server_packet = 'i.';
            server_packet += input.join('-') + '.';
            server_packet += this.local_time.toFixed(3).replace('.','-') + '.';
            server_packet += this.input_seq;

        console.log("server packet: " + server_packet);
        this.socket.send(  server_packet  );
        this.process_input(this.players.self);

    } else {
        return;// {hp : this.hp};
    }
}; //game_core.client_handle_input

game_core.prototype.client_process_net_prediction_correction = function() {

    if(!this.server_updates.length) return;

    var latest_server_data = this.server_updates[this.server_updates.length-1];

    var my_last_input_on_server = this.players.self.host ? latest_server_data.his : latest_server_data.cis;
    
    if(my_last_input_on_server) {
        var lastinputseq_index = -1;
        for(var i = 0; i < this.players.self.inputs.length; ++i) {
            if(this.players.self.inputs[i].seq == my_last_input_on_server) {
                lastinputseq_index = i;
                break;
            }
        }

        if(lastinputseq_index != -1) {
            var number_to_clear = Math.abs(lastinputseq_index - (-1));
            this.players.self.inputs.splice(0, number_to_clear);
            this.players.self.last_input_seq = lastinputseq_index;
        } // if(lastinputseq_index != -1)
    } //if my_last_input_on_server
}; //game_core.client_process_net_prediction_correction

game_core.prototype.client_process_net_updates = function() {

    if(!this.server_updates.length) return;

    var current_time = this.client_time;
    var count = this.server_updates.length-1;
    var target = null;
    var previous = null;

    for(var i = 0; i < count; ++i) {

        var point = this.server_updates[i];
        var next_point = this.server_updates[i+1];

        if(current_time > point.t && current_time < next_point.t) {
            target = next_point;
            previous = point;
            break;
        }
    }

    if(!target) {
        target = this.server_updates[0];
        previous = this.server_updates[0];
    }

    if(target && previous) {

        this.target_time = target.t;

        var difference = this.target_time - current_time;
        var max_difference = (target.t - previous.t).fixed(3);
        var time_point = (difference/max_difference).fixed(3);

        if( isNaN(time_point) ) time_point = 0;
        if(time_point == -Infinity) time_point = 0;
        if(time_point == Infinity) time_point = 0;

        var latest_server_data = this.server_updates[ this.server_updates.length-1 ];

        //var latest_hp = target.hp;
        //this.players.other.game.hp = latest_hp;
        //this.players.self.game.hp = latest_hp;
        
    } //if target && previous

}; //game_core.client_process_net_updates

game_core.prototype.client_onserverupdate_received = function(data){

        //var player_host = this.players.self.host ?  this.players.self : this.players.other;
        //var player_client = this.players.self.host ?  this.players.other : this.players.self;
        var player_host = this.players.self;
        var this_player = this.players.self;
        
        this.server_time = data.t;
        this.client_time = this.server_time - (this.net_offset/1000);

        this.server_updates.push(data);

        if(this.server_updates.length >= ( 60*this.buffer_size )) {
            this.server_updates.splice(0,1);
        }

        this.oldest_tick = this.server_updates[0].t;
        this.client_process_net_prediction_correction();

}; //game_core.client_onserverupdate_recieved

game_core.prototype.client_update = function() {

    this.ctx.clearRect(0,0,720,480);
    this.client_handle_input();

    if( !this.naive_approach ) {
        this.client_process_net_updates();
    }    

    //this.players.other.draw();
    this.players.self.draw();

    this.client_refresh_fps();
}; //game_core.update_client

game_core.prototype.create_timer = function(){
    setInterval(function(){
        this._dt = new Date().getTime() - this._dte;
        this._dte = new Date().getTime();
        this.local_time += this._dt/1000.0;
    }.bind(this), 4);
}

game_core.prototype.client_create_ping_timer = function() {
    setInterval(function(){
        this.last_ping_time = new Date().getTime() - this.fake_lag;
        this.socket.send('p.' + (this.last_ping_time) );
    }.bind(this), 1000);
}; //game_core.client_create_ping_timer


game_core.prototype.client_create_configuration = function() {
    this.show_help = false;             //Whether or not to draw the help text
    this.last_ping_time = 0.001;        //The time we last sent a ping
};//game_core.client_create_configuration

game_core.prototype.client_onconnected = function(data) {
    this.players.self.id = data.id;
    this.players.self.state = 'connected';
    this.players.self.online = true;
}; //client_onconnected

game_core.prototype.client_onping = function(data) {
    this.net_ping = new Date().getTime() - parseFloat( data );
    this.net_latency = this.net_ping/2;
}; //client_onping

game_core.prototype.client_onnetmessage = function(data) {

    var commands = data.split('.');
    var command = commands[0];
    var subcommand = commands[1] || null;
    var commanddata = commands[2] || null;

    switch(command) {
        case 's': //server message
            switch(subcommand) {
                case 'e' : //end game requested
                    this.client_ondisconnect(commanddata); break;
                case 'p' : //server ping
                    this.client_onping(commanddata); break;
            } //subcommand
        break; //'s'
    } //command
                
}; //client_onnetmessage

game_core.prototype.client_ondisconnect = function(data) {
    this.players.self.state = 'not-connected';
    this.players.self.online = false;
    this.players.other.state = 'not-connected';
}; //client_ondisconnect

game_core.prototype.client_connect_to_server = function() {
        this.socket = io.connect();

        this.socket.on('connect', function(){
            this.players.self.state = 'connecting';
        }.bind(this));

        this.socket.on('disconnect', this.client_ondisconnect.bind(this));
        this.socket.on('onserverupdate', this.client_onserverupdate_received.bind(this));
        this.socket.on('onconnected', this.client_onconnected.bind(this));
        this.socket.on('error', this.client_ondisconnect.bind(this));
        this.socket.on('message', this.client_onnetmessage.bind(this));
}; //game_core.client_connect_to_server


game_core.prototype.client_refresh_fps = function() {
    this.fps = 1/this.dt;
    this.fps_avg_acc += this.fps;
    this.fps_avg_count++;

    if(this.fps_avg_count >= 10) {
        this.fps_avg = this.fps_avg_acc/10;
        this.fps_avg_count = 1;
        this.fps_avg_acc = this.fps;
    } //reached 10 frames
}; //game_core.client_refresh_fps

