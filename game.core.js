
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

    var game_core = function(game_instance){

        this.instance = game_instance;
        this.server = this.instance !== undefined;

        this.world = {
            width : 720,
            height : 480
        };

        if(this.server) {

            this.players = {
                self : new game_player(this,this.instance.player_host),
                other : new game_player(this,this.instance.player_client)
            };

           this.players.self.pos = {x:20,y:20};

        } else {

            this.players = {
                self : new game_player(this),
                other : new game_player(this)
            };

            this.ghosts = {
                server_pos_self : new game_player(this),
                server_pos_other : new game_player(this),
                pos_other : new game_player(this)
            };

            this.ghosts.pos_other.state = 'dest_pos';

            this.ghosts.pos_other.info_color = 'rgba(255,255,255,0.1)';

            this.ghosts.server_pos_self.info_color = 'rgba(255,255,255,0.2)';
            this.ghosts.server_pos_other.info_color = 'rgba(255,255,255,0.2)';

            this.ghosts.server_pos_self.state = 'server_pos';
            this.ghosts.server_pos_other.state = 'server_pos';

            this.ghosts.server_pos_self.pos = { x:20, y:20 };
            this.ghosts.pos_other.pos = { x:500, y:200 };
            this.ghosts.server_pos_other.pos = { x:500, y:200 };
        }

        this.playerspeed = 120;

        this._pdt = 0.0001;                 //The physics update delta time
        this._pdte = new Date().getTime();  //The physics update last delta time
        this.local_time = 0.016;            //The local timer
        this._dt = new Date().getTime();    //The local timer delta
        this._dte = new Date().getTime();   //The local timer last frame time

        this.create_physics_simulation();

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
    // (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
    //copies a 2d vector like object from one to another
game_core.prototype.pos = function(a) { return {x:a.x,y:a.y}; };
    //Add a 2d vector with another one and return the resulting vector
game_core.prototype.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
    //Subtract a 2d vector with another one and return the resulting vector
game_core.prototype.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
    //Multiply a 2d vector with a scalar value and return the resulting vector
game_core.prototype.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
    //For the server, we need to cancel the setTimeout that the polyfill creates
game_core.prototype.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
    //Simple linear interpolation
game_core.prototype.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
    //Simple linear interpolation between 2 vectors
game_core.prototype.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };

/*
    The player class
*/

    var game_player = function( game_instance, player_instance ) {

        this.instance = player_instance;
        this.game = game_instance;

        this.pos = { x:0, y:0 };
        this.size = { x:16, y:16, hx:8, hy:8 };
        this.state = 'not-connected';
        this.color = 'rgba(255,255,255,0.1)';
        this.info_color = 'rgba(255,255,255,0.1)';
        this.id = '';

        this.old_state = {pos:{x:0,y:0}};
        this.cur_state = {pos:{x:0,y:0}};
        this.state_time = new Date().getTime();

        this.inputs = [];

        this.pos_limits = {
            x_min: this.size.hx,
            x_max: this.game.world.width - this.size.hx,
            y_min: this.size.hy,
            y_max: this.game.world.height - this.size.hy
        };

        if(player_instance) {
            this.pos = { x:20, y:20 };
        } else {
            this.pos = { x:500, y:200 };
        }

    }; //game_player.constructor
  
    game_player.prototype.draw = function(){

        game.ctx.fillStyle = this.color;

        game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);

        game.ctx.fillStyle = this.info_color;
        game.ctx.fillText(this.state, this.pos.x+10, this.pos.y + 4);
    
    }; //game_player.draw

/*
 Common functions
*/

game_core.prototype.update = function(t) {
    
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;

    this.lastframetime = t;

    if(!this.server) {
        this.client_update();
    } else {
        this.server_update();
    }

    this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );

}; //game_core.update


/*
    Shared between server and client.
    In this example, `item` is always of type game_player.
*/
game_core.prototype.check_collision = function( item ) {

    if(item.pos.x <= item.pos_limits.x_min) {
        item.pos.x = item.pos_limits.x_min;
    }

    if(item.pos.x >= item.pos_limits.x_max ) {
        item.pos.x = item.pos_limits.x_max;
    }
    
    if(item.pos.y <= item.pos_limits.y_min) {
        item.pos.y = item.pos_limits.y_min;
    }

    if(item.pos.y >= item.pos_limits.y_max ) {
        item.pos.y = item.pos_limits.y_max;
    }

    item.pos.x = item.pos.x.fixed(4);
    item.pos.y = item.pos.y.fixed(4);
    
}; //game_core.check_collision


game_core.prototype.process_input = function( player ) {

    var x_dir = 0;
    var y_dir = 0;
    var ic = player.inputs.length;
    if(ic) {
        for(var j = 0; j < ic; ++j) {
            if(player.inputs[j].seq <= player.last_input_seq) continue;

            var input = player.inputs[j].inputs;
            var c = input.length;
            for(var i = 0; i < c; ++i) {
                var key = input[i];
                if(key == 'l') {
                    x_dir -= 1;
                }
                if(key == 'r') {
                    x_dir += 1;
                }
                if(key == 'd') {
                    y_dir += 1;
                }
                if(key == 'u') {
                    y_dir -= 1;
                }
            } //for all input values

        } //for each input command
    } //if we have inputs

    var resulting_vector = this.physics_movement_vector_from_direction(x_dir,y_dir);
    if(player.inputs.length) {
        player.last_input_time = player.inputs[ic-1].time;
        player.last_input_seq = player.inputs[ic-1].seq;
    }

    return resulting_vector;

}; //game_core.process_input



game_core.prototype.physics_movement_vector_from_direction = function(x,y) {

    return {
        x : (x * (this.playerspeed * 0.015)).fixed(3),
        y : (y * (this.playerspeed * 0.015)).fixed(3)
    };

}; //game_core.physics_movement_vector_from_direction

game_core.prototype.update_physics = function() {

    if(this.server) {
        this.server_update_physics();
    } else {
        this.client_update_physics();
    }

}; //game_core.prototype.update_physics

/*
 Server side functions
*/

game_core.prototype.server_update_physics = function() {
    this.players.self.old_state.pos = this.pos( this.players.self.pos );
    var new_dir = this.process_input(this.players.self);
    this.players.self.pos = this.v_add( this.players.self.old_state.pos, new_dir );

    this.players.other.old_state.pos = this.pos( this.players.other.pos );
    var other_new_dir = this.process_input(this.players.other);
    this.players.other.pos = this.v_add( this.players.other.old_state.pos, other_new_dir);

    this.check_collision( this.players.self );
    this.check_collision( this.players.other );

    this.players.self.inputs = [];
    this.players.other.inputs = [];

}; //game_core.server_update_physics

game_core.prototype.server_update = function(){

    this.server_time = this.local_time;

    this.laststate = {
        hp  : this.players.self.pos,                
        cp  : this.players.other.pos,              
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

    var player_client =
        (client.userid == this.players.self.instance.userid) ?
            this.players.self : this.players.other;

   player_client.inputs.push({inputs:input, time:input_time, seq:input_seq});

}; //game_core.handle_server_input


/*
 Client side functions
*/

game_core.prototype.client_handle_input = function(){

    var x_dir = 0;
    var y_dir = 0;
    var input = [];
    this.client_has_input = false;

    if( this.keyboard.pressed('A') ||
        this.keyboard.pressed('left')) {
            x_dir = -1;
            input.push('l');
        } //left

    if( this.keyboard.pressed('D') ||
        this.keyboard.pressed('right')) {
            x_dir = 1;
            input.push('r');
        } //right

    if( this.keyboard.pressed('S') ||
        this.keyboard.pressed('down')) {
            y_dir = 1;
            input.push('d');
        } //down

    if( this.keyboard.pressed('W') ||
        this.keyboard.pressed('up')) {
            y_dir = -1;
            input.push('u');
        } //up

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

        this.socket.send(  server_packet  );

        return this.physics_movement_vector_from_direction( x_dir, y_dir );

    } else {
        return {x:0,y:0};
    }

}; //game_core.client_handle_input

game_core.prototype.client_process_net_prediction_correction = function() {

    if(!this.server_updates.length) return;

    var latest_server_data = this.server_updates[this.server_updates.length-1];

    var my_server_pos = this.players.self.host ? latest_server_data.hp : latest_server_data.cp;

    this.ghosts.server_pos_self.pos = this.pos(my_server_pos);

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
                this.players.self.cur_state.pos = this.pos(my_server_pos);
                this.players.self.last_input_seq = lastinputseq_index;
                this.client_update_physics();
                this.client_update_local_position();
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

        var other_server_pos = this.players.self.host ? latest_server_data.cp : latest_server_data.hp;

        var other_target_pos = this.players.self.host ? target.cp : target.hp;
        var other_past_pos = this.players.self.host ? previous.cp : previous.hp;

        this.ghosts.server_pos_other.pos = this.pos(other_server_pos);
        this.ghosts.pos_other.pos = this.v_lerp(other_past_pos, other_target_pos, time_point);

        if(this.client_smoothing) {
            this.players.other.pos = this.v_lerp( this.players.other.pos, this.ghosts.pos_other.pos, this._pdt*this.client_smooth);
        } else {
            this.players.other.pos = this.pos(this.ghosts.pos_other.pos);
        }

        if(!this.client_predict && !this.naive_approach) {

            var my_server_pos = this.players.self.host ? latest_server_data.hp : latest_server_data.cp;

            var my_target_pos = this.players.self.host ? target.hp : target.cp;
            var my_past_pos = this.players.self.host ? previous.hp : previous.cp;

            this.ghosts.server_pos_self.pos = this.pos(my_server_pos);
            var local_target = this.v_lerp(my_past_pos, my_target_pos, time_point);

            if(this.client_smoothing) {
                this.players.self.pos = this.v_lerp( this.players.self.pos, local_target, this._pdt*this.client_smooth);
            } else {
                this.players.self.pos = this.pos( local_target );
            }
        }
    } //if target && previous

}; //game_core.client_process_net_updates

game_core.prototype.client_onserverupdate_recieved = function(data){

        var player_host = this.players.self.host ?  this.players.self : this.players.other;
        var player_client = this.players.self.host ?  this.players.other : this.players.self;
        var this_player = this.players.self;
        
        this.server_time = data.t;
        this.client_time = this.server_time - (this.net_offset/1000);

        if(this.naive_approach) {

            if(data.hp) {
                player_host.pos = this.pos(data.hp);
            }

            if(data.cp) {
                player_client.pos = this.pos(data.cp);
            }

        } else {
            this.server_updates.push(data);

            if(this.server_updates.length >= ( 60*this.buffer_size )) {
                this.server_updates.splice(0,1);
            }

            this.oldest_tick = this.server_updates[0].t;

            this.client_process_net_prediction_correction();
            
        } //non naive

}; //game_core.client_onserverupdate_recieved

game_core.prototype.client_update_local_position = function(){

 if(this.client_predict) {

        var t = (this.local_time - this.players.self.state_time) / this._pdt;

        var old_state = this.players.self.old_state.pos;
        var current_state = this.players.self.cur_state.pos;

        this.players.self.pos = current_state;
        
        this.check_collision( this.players.self );

    }  //if(this.client_predict)

}; //game_core.prototype.client_update_local_position

game_core.prototype.client_update_physics = function() {

    if(this.client_predict) {

        this.players.self.old_state.pos = this.pos( this.players.self.cur_state.pos );
        var nd = this.process_input(this.players.self);
        this.players.self.cur_state.pos = this.v_add( this.players.self.old_state.pos, nd);
        this.players.self.state_time = this.local_time;

    }

}; //game_core.client_update_physics

game_core.prototype.client_update = function() {

    this.ctx.clearRect(0,0,720,480);
    this.client_draw_info();
    this.client_handle_input();

    if( !this.naive_approach ) {
        this.client_process_net_updates();
    }

    this.players.other.draw();
    this.client_update_local_position();
    this.players.self.draw();

    if(this.show_dest_pos && !this.naive_approach) {
        this.ghosts.pos_other.draw();
    }

    if(this.show_server_pos && !this.naive_approach) {
        this.ghosts.server_pos_self.draw();
        this.ghosts.server_pos_other.draw();
    }

    this.client_refresh_fps();
}; //game_core.update_client

game_core.prototype.create_timer = function(){
    setInterval(function(){
        this._dt = new Date().getTime() - this._dte;
        this._dte = new Date().getTime();
        this.local_time += this._dt/1000.0;
    }.bind(this), 4);
}

game_core.prototype.create_physics_simulation = function() {

    setInterval(function(){
        this._pdt = (new Date().getTime() - this._pdte)/1000.0;
        this._pdte = new Date().getTime();
        this.update_physics();
    }.bind(this), 15);

}; //game_core.client_create_physics_simulation


game_core.prototype.client_create_ping_timer = function() {

    setInterval(function(){

        this.last_ping_time = new Date().getTime() - this.fake_lag;
        this.socket.send('p.' + (this.last_ping_time) );

    }.bind(this), 1000);
    
}; //game_core.client_create_ping_timer


game_core.prototype.client_create_configuration = function() {

    this.show_help = false;             //Whether or not to draw the help text
    this.naive_approach = false;        //Whether or not to use the naive approach
    this.show_server_pos = false;       //Whether or not to show the server position
    this.show_dest_pos = false;         //Whether or not to show the interpolation goal
    this.client_predict = true;         //Whether or not the client is predicting input
    this.input_seq = 0;                 //When predicting client inputs, we store the last input as a sequence number
    this.client_smoothing = true;       //Whether or not the client side prediction tries to smooth things out
    this.client_smooth = 25;            //amount of smoothing to apply to client update dest

    this.net_latency = 0.001;           //the latency between the client and the server (ping/2)
    this.net_ping = 0.001;              //The round trip time from here to the server,and back
    this.last_ping_time = 0.001;        //The time we last sent a ping
    this.fake_lag = 0;                //If we are simulating lag, this applies only to the input client (not others)
    this.fake_lag_time = 0;

    this.net_offset = 100;              //100 ms latency between server and client interpolation for other clients
    this.buffer_size = 2;               //The size of the server history to keep for rewinding/interpolating.
    this.target_time = 0.01;            //the time where we want to be in the server timeline
    this.oldest_tick = 0.01;            //the last time tick we have available in the buffer

    this.client_time = 0.01;            //Our local 'clock' based on server time - client interpolation(net_offset).
    this.server_time = 0.01;            //The time the server reported it was at, last we heard from it
    
    this.dt = 0.016;                    //The time that the last frame took to run
    this.fps = 0;                       //The current instantaneous fps (1/this.dt)
    this.fps_avg_count = 0;             //The number of samples we have taken for fps_avg
    this.fps_avg = 0;                   //The current average fps displayed in the debug UI
    this.fps_avg_acc = 0;               //The accumulation of the last avgcount fps samples

    this.lit = 0;
    this.llt = new Date().getTime();

};//game_core.client_create_configuration

game_core.prototype.client_create_debug_gui = function() {

    this.gui = new dat.GUI();

    var _playersettings = this.gui.addFolder('Your settings');

        this.colorcontrol = _playersettings.addColor(this, 'color');

        this.colorcontrol.onChange(function(value) {
            this.players.self.color = value;
            localStorage.setItem('color', value);
            this.socket.send('c.' + value);
        }.bind(this));

        _playersettings.open();

    var _othersettings = this.gui.addFolder('Methods');

        _othersettings.add(this, 'naive_approach').listen();
        _othersettings.add(this, 'client_smoothing').listen();
        _othersettings.add(this, 'client_smooth').listen();
        _othersettings.add(this, 'client_predict').listen();

    var _debugsettings = this.gui.addFolder('Debug view');
        
        _debugsettings.add(this, 'show_help').listen();
        _debugsettings.add(this, 'fps_avg').listen();
        _debugsettings.add(this, 'show_server_pos').listen();
        _debugsettings.add(this, 'show_dest_pos').listen();
        _debugsettings.add(this, 'local_time').listen();

        _debugsettings.open();

    var _consettings = this.gui.addFolder('Connection');
        _consettings.add(this, 'net_latency').step(0.001).listen();
        _consettings.add(this, 'net_ping').step(0.001).listen();

            //When adding fake lag, we need to tell the server about it.
        var lag_control = _consettings.add(this, 'fake_lag').step(0.001).listen();
        lag_control.onChange(function(value){
            this.socket.send('l.' + value);
        }.bind(this));

        _consettings.open();

    var _netsettings = this.gui.addFolder('Networking');
        
        _netsettings.add(this, 'net_offset').min(0.01).step(0.001).listen();
        _netsettings.add(this, 'server_time').step(0.001).listen();
        _netsettings.add(this, 'client_time').step(0.001).listen();
        //_netsettings.add(this, 'oldest_tick').step(0.001).listen();

        _netsettings.open();

}; //game_core.client_create_debug_gui

game_core.prototype.client_reset_positions = function() {

    var player_host = this.players.self.host ?  this.players.self : this.players.other;
    var player_client = this.players.self.host ?  this.players.other : this.players.self;

    player_host.pos = { x:20,y:20 };
    player_client.pos = { x:500, y:200 };

    this.players.self.old_state.pos = this.pos(this.players.self.pos);
    this.players.self.pos = this.pos(this.players.self.pos);
    this.players.self.cur_state.pos = this.pos(this.players.self.pos);

    this.ghosts.server_pos_self.pos = this.pos(this.players.self.pos);

    this.ghosts.server_pos_other.pos = this.pos(this.players.other.pos);
    this.ghosts.pos_other.pos = this.pos(this.players.other.pos);

}; //game_core.client_reset_positions

game_core.prototype.client_onreadygame = function(data) {

    var server_time = parseFloat(data.replace('-','.'));

    var player_host = this.players.self.host ?  this.players.self : this.players.other;
    var player_client = this.players.self.host ?  this.players.other : this.players.self;

    this.local_time = server_time + this.net_latency;
    console.log('server time is about ' + this.local_time);

    player_host.info_color = '#2288cc';
    player_client.info_color = '#cc8822';
        
    player_host.state = 'local_pos(hosting)';
    player_client.state = 'local_pos(joined)';

    this.players.self.state = 'YOU ' + this.players.self.state;

     this.socket.send('c.' + this.players.self.color);

}; //client_onreadygame

game_core.prototype.client_onjoingame = function(data) {

        //We are not the host
    this.players.self.host = false;
        //Update the local state
    this.players.self.state = 'connected.joined.waiting';
    this.players.self.info_color = '#00bb00';

        //Make sure the positions match servers and other clients
    this.client_reset_positions();

}; //client_onjoingame

game_core.prototype.client_onhostgame = function(data) {

    var server_time = parseFloat(data.replace('-','.'));

    this.local_time = server_time + this.net_latency;

    this.players.self.host = true;

    this.players.self.state = 'hosting.waiting for a player';
    this.players.self.info_color = '#cc0000';

    this.client_reset_positions();

}; //client_onhostgame

game_core.prototype.client_onconnected = function(data) {

    this.players.self.id = data.id;
    this.players.self.info_color = '#cc0000';
    this.players.self.state = 'connected';
    this.players.self.online = true;

}; //client_onconnected

game_core.prototype.client_on_otherclientcolorchange = function(data) {

    this.players.other.color = data;

}; //game_core.client_on_otherclientcolorchange

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

                case 'h' : //host a game requested
                    this.client_onhostgame(commanddata); break;

                case 'j' : //join a game requested
                    this.client_onjoingame(commanddata); break;

                case 'r' : //ready a game requested
                    this.client_onreadygame(commanddata); break;

                case 'e' : //end game requested
                    this.client_ondisconnect(commanddata); break;

                case 'p' : //server ping
                    this.client_onping(commanddata); break;

                case 'c' : //other player changed colors
                    this.client_on_otherclientcolorchange(commanddata); break;

            } //subcommand

        break; //'s'
    } //command
                
}; //client_onnetmessage

game_core.prototype.client_ondisconnect = function(data) {
    
    this.players.self.info_color = 'rgba(255,255,255,0.1)';
    this.players.self.state = 'not-connected';
    this.players.self.online = false;

    this.players.other.info_color = 'rgba(255,255,255,0.1)';
    this.players.other.state = 'not-connected';

}; //client_ondisconnect

game_core.prototype.client_connect_to_server = function() {
        
        this.socket = io.connect();

        this.socket.on('connect', function(){
            this.players.self.state = 'connecting';
        }.bind(this));

        this.socket.on('disconnect', this.client_ondisconnect.bind(this));
        this.socket.on('onserverupdate', this.client_onserverupdate_recieved.bind(this));
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


game_core.prototype.client_draw_info = function() {

    this.ctx.fillStyle = 'rgba(255,255,255,0.3)';

    if(this.show_help) {

        this.ctx.fillText('net_offset : local offset of others players and their server updates. Players are net_offset "in the past" so we can smoothly draw them interpolated.', 10 , 30);
        this.ctx.fillText('server_time : last known game time on server', 10 , 70);
        this.ctx.fillText('client_time : delayed game time on client for other players only (includes the net_offset)', 10 , 90);
        this.ctx.fillText('net_latency : Time from you to the server. ', 10 , 130);
        this.ctx.fillText('net_ping : Time from you to the server and back. ', 10 , 150);
        this.ctx.fillText('fake_lag : Add fake ping/lag for testing, applies only to your inputs (watch server_pos block!). ', 10 , 170);
        this.ctx.fillText('client_smoothing/client_smooth : When updating players information from the server, it can smooth them out.', 10 , 210);
        this.ctx.fillText(' This only applies to other clients when prediction is enabled, and applies to local player with no prediction.', 170 , 230);

    } //if this.show_help

    if(this.players.self.host) {

        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.fillText('You are the host', 10 , 465);

    } //if we are the host

    this.ctx.fillStyle = 'rgba(255,255,255,1)';

}; //game_core.client_draw_help
