    var
        game_server = module.exports = { games : {}, game_count:0 },
        UUID        = require('node-uuid'),
        verbose     = true;

    global.window = global.document = global;

    require('./game.core.js');

    game_server.log = function() {
        if(verbose) console.log.apply(this,arguments);
    };

    game_server.local_time = 0;
    game_server._dt = new Date().getTime();
    game_server._dte = new Date().getTime();
    game_server.messages = [];

    setInterval(function(){
        game_server._dt = new Date().getTime() - game_server._dte;
        game_server._dte = new Date().getTime();
        game_server.local_time += game_server._dt/1000.0;
    }, 4);

    game_server.onMessage = function(client,message) {

        var message_parts = message.split('.');
        var message_type = message_parts[0];

        //var other_client =
        //    (client.game.player_host.userid == client.userid) ?
        //        client.game.player_client : client.game.player_host;

        if(message_type == 'i') {
            this.onInput(client, message_parts);
        } else if(message_type == 'p') {
            client.send('s.p.' + message_parts[1]);
        } 
    }; //game_server.onMessage

    game_server.onInput = function(client, parts) {
        var input_commands = parts[1].split('-');
        var input_time = parts[2].replace('-','.');
        var input_seq = parts[3];

        if(client && client.game && client.game.gamecore) {
            client.game.gamecore.handle_server_input(client, input_commands, input_time, input_seq);
        }

    }; //game_server.onInput

    game_server.createGame = function(player) {

        var thegame = {
                id : UUID(),                //generate a new id for the game
                player_host:player,         //so we know who initiated the game
                player_client : null,       //nobody else joined yet, since its new
                player_count : 1,           //for simple checking of state
                hp : 5000
            };

        this.games[ thegame.id ] = thegame;
        this.game_count++;

        thegame.gamecore = new game_core( thegame );
        thegame.gamecore.update( new Date().getTime() );

        player.send('s.h.'+ String(thegame.gamecore.local_time).replace('.','-'));
        console.log('server host at  ' + thegame.gamecore.local_time);
        player.game = thegame;
        player.hosting = true;
        
        this.log('player ' + player.userid + ' created a game with id ' + player.game.id);
        
        return thegame;

    }; //game_server.createGame

    game_server.endGame = function(gameid, userid) {

        var thegame = this.games[gameid];
        if(thegame) {

            thegame.gamecore.stop_update();

            if(thegame.player_count > 1) {

            /*
                if(userid == thegame.player_host.userid) {
                    if(thegame.player_client) {
                        thegame.player_client.send('s.e');
                        this.findGame(thegame.player_client);
                    }
                    
                } else {
            */        if(thegame.player_host) {
                        thegame.player_host.send('s.e');
                        thegame.player_host.hosting = false;
                        this.findGame(thegame.player_host);
                    //}
                }
            }

            delete this.games[gameid];
            this.game_count--;
            this.log('game removed. there are now ' + this.game_count + ' games' );

        } else {
            this.log('that game was not found!');
        }

    }; //game_server.endGame

    game_server.startGame = function(game) {
        this.log('starting game');
        //game.player_client.send('s.j.' + game.player_host.userid);
        //game.player_client.game = game;
        //game.player_client.send('s.r.'+ String(game.gamecore.local_time).replace('.','-'));
        game.player_host.send('s.r.'+ String(game.gamecore.local_time).replace('.','-'));
        game.active = true;
    }; //game_server.startGame

    game_server.findGame = function(player) {

        this.log('looking for a game. We have : ' + this.game_count);

        var thegame = this.createGame(player); //one-player mode for now
        this.startGame(thegame);
        
        if(this.game_count) {
                
            var joined_a_game = false;

            for(var gameid in this.games) {
                if(!this.games.hasOwnProperty(gameid)) continue;
                var game_instance = this.games[gameid];

                if(game_instance.player_count < 2) {
                    joined_a_game = true;
                    game_instance.player_client = player;
                    game_instance.gamecore.players.other.instance = player;
                    game_instance.player_count++;
                    this.startGame(game_instance);
                } //if less than 2 players
            } //for all games

            if(!joined_a_game) {
                this.createGame(player);
            } //if no join already

        } else { //if there are any games at all
            this.createGame(player);
        }
    }; //game_server.findGame

