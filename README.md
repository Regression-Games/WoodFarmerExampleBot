# RG Bot Template

This template is used to create a very simple bot for the Regression Games: Ultimate Collector challenge.

Take a look at `index.js` - every bot must have this file, with at minimum, the following code:

```
function configureBot(bot) {
  // Bot logic here
}

exports.configureBot = configureBot
```

Don't worry if you don't understand this code exactly - all it does is define a function and exposes that function to Regression Games.

Now, let's make our bot do something really simple - have it speak back what it hears from other players.

```
function configureBot(bot) {
  bot.on('chat', (username, message) => { // line 1
      if (username === bot.username) return // line 2
      bot.chat("This is what I heard: " + message) // line 3
  })
}

exports.configureBot = configureBot
```

Here is what each line does:
* `line 1` - Every time a player says something in the game, do something with the speaker's username and their message.
* `line 2` - If the username of the speaker is equal to the username of this bot, don't do anything else. This is because we don't want the bot to repeat something that it says itself, or else it will spam the chat and be kicked from the game!
* `line 3` - Have the bot speak out what it heard from the player.


_Not sure what this is? Visit https://regression.gg for some programming fun!_