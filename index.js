const { mineflayer } = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalNear, GoalBlock, GoalGetToBlock, GoalLookAtBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
const { Vec3 } = require('vec3');

/**
 * Mineflayer API docs - https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
 * Mineflayer Pathfinder API docs - https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/readme.md
 */
function configureBot(bot) {

  bot.loadPlugin(pathfinder)

  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)

  let keepAttacking = true;
  let lastBlockAttempted = undefined

  let lastFarmedType = undefined;
  let farmingInProgress = false;
  let farmingDeliveryRun = false;

  /**
   * When spawned, start looking for wood
   */
  bot.on('spawn', () => {
    farmingInProgress = true;
    farmingDeliveryRun = false;
    bot.settings.viewDistance = 'far';
    farmerRoutine(lastFarmedType || 'log')
  })

  bot.on('path_update', (r) => {
    // const nodesPerTick = (r.visitedNodes * 50 / r.time).toFixed(2)
    // console.log(`I can get there in ${r.path.length} moves. Computation took ${r.time.toFixed(2)} ms (${r.visitedNodes} nodes, ${nodesPerTick} nodes/tick)`)
  })

  bot.on('goal_reached', (goal) => {
    console.log('Path goal reached, now to do some work')
  })

  let stuckCount = 0

  bot.on('path_reset', (reason) => {
    console.log(`Path was reset for reason: ${reason}`)
    if ('stuck' === reason || 'place_error' === reason || 'dig_error' === reason) {
      // TODO: If still stuck after 10 ? Do we want to just respawn... b/c we're stuck stuck... or call for help / guide our player to us
      if (++stuckCount > 5) {
        stuckCount = 0;
        console.log("Stuck bot: Stopping")
        stopBot();
        console.log("Stuck bot: Reloading ")
        bot.end()
      }
    }
  })

  /**
   * sample for equipping items that get picked up
   */
  bot.inventory.on('windowUpdate', function(collector, collected) {
    if(collector.type === 'player' && collected.type === 'object' && collector.username == bot.username) {
      let rawItem = collected.metadata[10];
      let item = mineflayer.Item.fromNotch(rawItem);
      if(item.name=="iron_helmet") {
        bot.equip(item.type,"head");
      } else if(item.name=="leather_helmet") {
        bot.equip(item.type,"head");
      }
    }
  });

  bot.on('whisper', (...args) => {
    const parameters = args.join('] [');
    console.log(`WHISPER event with parameters [${parameters}]`);
    handleChatOrWhisper(args[0], args[1])
  })

  bot.on('chat', (...args) => {
    const parameters = args.join('] [');
    console.log(`CHAT event with parameters [${parameters}]`);
    handleChatOrWhisper(args[0], args[1])
  })

  function handleChatOrWhisper( username, message ) {
    if (username === bot.username || username === 'you') return

    if (message === 'reinit') {
      bot.end()
    } else if (message === 'stop') {
      console.log('YES, I will stop')
      if (username) {
        bot.whisper(username, 'YES, I will stop')
      }
      stopBot()
    } else if (message.startsWith('locate')) {
      // TODO Implement the bot telling you how many degrees left or right and up or down to walk toward it
      let player = mcData.entitiesArray.find((entity) => {
        if (entity.type === 'player'){
          console.log("Evaluating: " + (player.displayName || player.name))
        }
        return false;
      })
    } else if (message.startsWith('come')) {
      const cmd = message.split(' ')
      let range = undefined;
      if (cmd.length >= 2) { // goto x y z
        range = cmd[1]
      }
      if (range) {
        comeToPlayer(username,range).catch((err) => {console.error("Couldn't find: " + username + " in range: " + range, err)})
      } else {
        comeToPlayer(username).catch((err) => {console.error("Couldn't find: " + username, err)})
      }
    } else if (message.startsWith('goto')) {
      const cmd = message.split(' ')

      if (cmd.length === 4) { // goto x y z
        const x = parseInt(cmd[1], 10)
        const y = parseInt(cmd[2], 10)
        const z = parseInt(cmd[3], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalBlock(x, y, z))
      } else if (cmd.length === 3) { // goto x z
        const x = parseInt(cmd[1], 10)
        const z = parseInt(cmd[2], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalXZ(x, z))
      } else if (cmd.length === 2) { // goto y
        const y = parseInt(cmd[1], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalY(y))
      }
    } else if (message.startsWith('follow')) {
      const cmd = message.split(' ')
      let range = undefined;
      if (cmd.length >= 2) { // goto x y z
        range = parseInt(cmd[1], 10)
        console.log('range: ' + range)
      }
      if (range) {
        followPlayer(username,range)
      } else {
        followPlayer(username)
      }
    } else if (message.startsWith('avoid')) {
      const cmd = message.split(' ')
      let range = undefined;
      if (cmd.length >= 2) { // goto x y z
        range = parseInt(cmd[1], 10)
        console.log('range: ' + range)
      }
      if (range) {
        avoidPlayer(username,range)
      } else {
        avoidPlayer(username)
      }
    } else if (message.startsWith('pickup')) {
      const cmd = message.split(' ')
      let pickupThing = undefined;
      if (cmd.length >= 2) { // goto x y z
        pickupThing = cmd[1]
      }
      let pickupRange = undefined;
      if (cmd.length >= 3) {
        pickupRange = parseInt(cmd[2], 10)
        console.log('pickupRange: ' + pickupRange)
      }

      if (pickupThing) {
        if (pickupRange) {
          pickupItem(pickupThing, pickupRange)
        } else {
          pickupItem(pickupThing)
        }
      } else {
        pickupItem()
      }
    } else if (message.startsWith('drop')) {
      const cmd = message.split(' ')
      let dropThing = undefined;
      if (cmd.length >= 2) { // goto x y z
        dropThing = cmd[1]
      }
      let dropQuantity = undefined;
      if (cmd.length >= 3) {
        dropQuantity = parseInt(cmd[2], 10)
        console.log('dropQuantity: ' + dropQuantity)
      }
      if (dropQuantity) {
        dropInventoryItem(username, dropThing, dropQuantity).catch((err) => {console.error("Couldn't drop item: " + dropThing, err)})
      } else {
        dropInventoryItem(username, dropThing).catch((err) => {console.error("Couldn't drop item: " + dropThing, err)})
      }
    } else if (message.startsWith('dig')) {
      stopBot(username)
      const cmd = message.split(' ')
      let blockType = undefined;
      if (cmd.length >= 2) { // goto x y z
        blockType = cmd[1]
      }
      findAndDigBlock(username, blockType).catch((err) => {console.error("Couldn't dig blockType: " + blockType, err)})
    } else if (message.startsWith('attack')) {
      stopBot(username)
      keepAttacking = true;
      const cmd = message.split(' ')
      let targetType = undefined;
      if (cmd.length >= 2) { // goto x y z
        targetType = cmd[1]
      }
      findAndAttackTarget(username, targetType)
    } else if (message === 'break') {
      keepAttacking = false;
      const target = bot.players[username] ? bot.players[username].entity : null
      if (!target) {
        bot.chat('I can\'t see: ' + username)
        return
      }
      let targetBlock = bot.blockAtEntityCursor(target)
      const p = target.position.offset(0, -1, 0)
      const goal = new GoalBlock(p.x, p.y, p.z);
      console.log('YES, I will break a block at - ' + p.x + ', ' + p.y + ', ' + p.z)
      bot.whisper(username, 'YES, I will break a block at - ' + p.x + ', ' + p.y + ', ' + p.z)
      bot.pathfinder.goto(goal)
          .then(() => {
            bot.dig(bot.blockAt(p))
                .catch(err => console.error('digging error', err))
          }, (err) => {
            console.error('Pathfinding error', err)
          })
    } else if (message.startsWith('farm')) {
      stopBot()
      const cmd = message.split(' ')
      let targetType = undefined;
      if (cmd.length >= 2) { // goto x y z
        targetType = cmd[1]
        farmingInProgress = true;
        farmingDeliveryRun = false;
        farmerRoutine(targetType.toLowerCase())
      }

    }
  }

  function stopBot()
  {
    bot.stopDigging();
    bot.pathfinder.stop()
    bot.pathfinder.setGoal(null)
    keepAttacking = false;
    lastBlockAttempted = undefined;
    lastFarmedType = undefined;
    farmingInProgress = false;
    farmingDeliveryRun = false;
  }

  /**
   * Main loop for a itemType farming routine that will deliver itemType to a player every deliveryThreshold collected
   * @param itemType
   * @param deliveryThreshold
   */
  function farmerRoutine(itemType, deliveryThreshold = 10, failureCount = 0) {
    console.log("Farmer: farmingInProgress=" + farmingInProgress + " , itemType: " + itemType)
    if (farmingInProgress) {

      // do a delivery run
      if (farmingDeliveryRun) {
        console.log("Farmer: DeliveryRun: Finding a player to deliver to")
        // find a target player
        const target = Object.entries(bot.players).find((pair) => {
          console.log("Checking Entity: " + pair[0] + " , " + pair[1].entity?.username)
          // TODO: Need to be able to detect that this is a Human, not another bot
          if (pair[1].entity && pair[1].entity?.username && pair[0] !== bot.entity.username) {
            console.log("Found Entity")
            return true;
          }
          return false;
        })
        if (target) {
          console.log("Farmer: DeliveryRun: Trying to deliver " + itemType + " to: " + target[1].entity.username)
          comeToPlayer(target[1].entity.username).then(() => {
            dropInventoryItem(target[1].entity.username, itemType).then( () => {
              console.log("Farmer: DeliveryRun: Made a delivery to: " + target[1].entity.username + ".. going back to farming")
              farmingDeliveryRun = false;
              // inside promise... need to run again
              setTimeout(() => {
                farmerRoutine(itemType, deliveryThreshold)
              }, 0);
            }).catch( (err) => {
              if (failureCount < 10) {
                console.log("Farmer: DeliveryRun: Failed to make a delivery at my target, trying again soon")
                setTimeout(() => {
                  farmerRoutine(itemType, deliveryThreshold, failureCount + 1)
                }, 100);
              } else {
                console.log("Farmer: DeliveryRun: No target player available for delivery after 10 tries.. going back to farming")
                farmingDeliveryRun = false;
                // inside promise... need to run again
                setTimeout(() => {
                  farmerRoutine(itemType, deliveryThreshold)
                }, 0);
              }
            })
          }).catch( (err) => {
            if (failureCount < 10) {
              console.log("Farmer: DeliveryRun: Didn't make it to my delivery target, trying again soon")
              setTimeout(() => {
                farmerRoutine(itemType, deliveryThreshold, failureCount + 1)
              }, 100);
            } else {
              console.log("Farmer: DeliveryRun: No target player available for delivery after 10 tries.. going back to farming")
              farmingDeliveryRun = false;
              // inside promise... need to run again
              setTimeout(() => {
                farmerRoutine(itemType, deliveryThreshold)
              }, 0);
            }
          })
        } else {
          console.log("Farmer: DeliveryRun: No player available for delivery.. going back to farming")
          farmingDeliveryRun = false;
          // not in a promise, no setTimeout
        }
      }

      // cut more
      if (!farmingDeliveryRun) {
        findAndDigBlock(undefined, itemType, false, 256).then( async () => {
          console.log("Farmer: Dug a " + itemType)
          lastFarmedType = itemType;
          // see if it's on the ground, and if so pick it up
          let itemOnGround = findItemInRange(itemType, 7)
          if (itemOnGround) {
            await pickupItem(itemOnGround).catch((err) => {});
          }
          let quantityAvailable = 0;
          let thingsInInventory = bot.inventory.items().filter((item) => {
            if (item.name && item.name.toLowerCase().includes(itemType) || (item.displayName && item.displayName.toLowerCase().includes(itemType))) {
              quantityAvailable += item.count
              return true;
            }
            return false;
          })
          if (quantityAvailable >= deliveryThreshold) {
            console.log("Farmer: Scheduling a delivery run for " + quantityAvailable + " " + itemType)
            farmingDeliveryRun = true;
          } else {
            console.log("Farmer: I have " + quantityAvailable + " / " + deliveryThreshold + " "  + itemType + " needed for a delivery")
          }
          setTimeout(() => {
            farmerRoutine(itemType, deliveryThreshold)
          }, 0);
        }).catch( (err) => {
          if (failureCount < 10) {
            console.error("Farmer: No " + itemType + " found, trying again soon", err)
            setTimeout(() => {
              farmerRoutine(itemType, deliveryThreshold, failureCount + 1)
            }, 100);
          }
          else {
            console.error("Farmer: No " + itemType + " found after 10 tries.. stopping the farming routine completely", err)
            farmingInProgress = false;
          }
        })
      }
    }
  }

  function findItemInRange(itemName, range= 30) {
    //TODO Never figured out how to get the name of a loose floating item, even by its id /wrists
    console.log("Looking for item " + itemName + " in range " + range)
    return bot.nearestEntity((entity) => {
      if( entity.type === "object" && entity.objectType === "Item") {
        // console.log("Evaluating: " + entity.name + "-" + entity.displayName + " at (" + entity.position.x + "," + entity.position.y + "," + entity.position.z + ")")
        if (bot.entity.position.distanceTo(entity.position) < range) {
          console.log("Found " + (entity.displayName || entity.name))
          return true;
        }
      }
      return false;
    })
  }

  /**
   * This will goto and pickup the item
   *
   * @param username
   * @param item
   * @param range
   */
  function pickupItem(item) {
    if (item) {
      return bot.pathfinder.goto(new GoalBlock(item.position.x, item.position.y, item.position.z))
    } else {
      return new Promise( function(resolve, reject) {
        reject( new Error("No item"))
      })
    }
  }

  function findAndPickupItem(itemName, range= 30) {
    return pickupItem(findItemInRange(itemName, range))
  }

  /**
   * This will drop the quantity requested of any inventory item matching the itemName.  So if you request to drop 'log', any type of log would be dropped to fulfill this request.
   * Note: -1 for quantity means to drop ALL of them, which is the default
   *
   * @param username
   * @param itemName
   * @param quantity
   */
  function dropInventoryItem(username, itemName, quantity= -1) {
    let quantityAvailable = 0;
    let itemsToDrop = bot.inventory.items().filter((item) => {
      if((item.name && item.name.toLowerCase().includes(itemName.toLowerCase())) || (item.displayName && item.displayName.toLowerCase().includes(itemName.toLowerCase()))) {
        quantityAvailable += item.count
        return true;
      }
      return false;
    })
    if (quantityAvailable > 0 && quantityAvailable >= quantity) {
      let quantityToDrop = (quantity<0?quantityAvailable:quantity);
      console.log('YES, I will drop ' + quantityToDrop + ' ' + itemName)
      bot.whisper(username, 'YES, I will drop ' + quantityToDrop + ' ' + itemName)
      return new Promise(function(resolve,reject) {
        let i = 0;
        while (quantityToDrop > 0 && i < itemsToDrop.length) {
          let theItem = itemsToDrop[i];
          let qty = (theItem.count > quantityToDrop ? quantityToDrop : theItem.count);
          bot.toss(theItem.type, theItem.metadata, qty).catch((err) => {});
          quantityToDrop -= qty;
          ++i;
        }
        if( quantityToDrop <= 0 ) {
          resolve()
        } else {
          reject(new Error('I dropped some, but didn\'t have ' + (quantity>0?quantity:'') + ' ' + itemName + ' to drop'))
        }
      })
    }
    else {
      console.log('NO, I don\'t have enough ' + itemName + ' to drop')
      bot.whisper(username, 'NO, I don\'t have enough ' + itemName + ' to drop')
      return new Promise(function(resolve,reject) {
        reject(new Error('I don\'t have enough ' + itemName + ' to drop'))
      })
    }
  }

  function comeToPlayer(username, range = 1) {
    const target = bot.players[username] ? bot.players[username].entity : null
    if (!target) {
      bot.chat('I don\'t see: ' + username)
      return new Promise(function(resolve,reject) {
        reject(new Error("No Target"))
      })
    }
    const p = target.position

    console.log('YES, I will come to ' + range + ' away from: ' + username)
    bot.whisper(username, 'YES, I will come to ' + range + ' away from you')

    bot.pathfinder.setMovements(defaultMove)
    return bot.pathfinder.goto(new GoalNear(p.x, p.y, p.z, range))
  }

  function followPlayer(username, range = 2) {
    const target = bot.players[username] ? bot.players[username].entity : null
    if (!target) {
      bot.chat('I don\'t see: ' + username)
      return
    }

    console.log('YES, I will follow at ' + range + ' away from: ' + username)
    bot.whisper(username, 'YES, I will follow at ' + range + ' away from you')

    bot.pathfinder.setMovements(defaultMove)
    bot.pathfinder.setGoal(new GoalFollow(target, range), true)
  }

  function avoidPlayer(username, range= 5) {
    const target = bot.players[username] ? bot.players[username].entity : null
    if (!target) {
      bot.chat('I don\'t see: ' + username)
      return
    }

    console.log('YES, I will stay at least ' + range + ' away from: ' + username)
    bot.whisper(username, 'YES, I will stay at least ' + range + ' away from you')

    bot.pathfinder.setMovements(defaultMove)
    bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, range)), true)
  }

  function digBlock(username, blockType, theBlock) {
    if (theBlock) {
      console.log('YES, I will dig - ' + theBlock.displayName || theBlock.name)
      if (username) {
        bot.whisper(username, 'YES, I will dig - ' + theBlock.displayName || theBlock.name)
      }
      lastBlockAttempted = theBlock;
      let pos = theBlock.position;
      bot.pathfinder.setMovements(defaultMove)

      return new Promise(function(resolve,reject) {
        bot.pathfinder.goto(new GoalLookAtBlock(new Vec3(pos.x, pos.y, pos.z), bot.world)).then(() => {
          console.log("Got to the block, now to dig it")
          bot.dig(theBlock)
              .then(() => {
                console.log('I dug up a ' + (theBlock.displayName || theBlock.name))
                if (username) {
                  bot.whisper(username, 'I dug up a ' + (theBlock.displayName || theBlock.name))
                }
                resolve()
              })
              .catch(err => {
                console.error('ERROR, I had problem trying to dig ' + theBlock.displayName || theBlock.name, err)
                if (username) {
                  bot.whisper(username, 'ERROR, I had problem trying to dig ' + theBlock.displayName || theBlock.name)
                }
                reject(new Error("Couldn't get to or dig block"))
              })
        }, (err) => {
          console.error('ERROR, I had pathfinding problem trying to dig ' + theBlock.displayName || theBlock.name, err)
          if (username) {
            bot.whisper(username, 'ERROR, I had pathfinding problem trying to dig ' + theBlock.displayName || theBlock.name)
          }
          reject(new Error("Couldn't get to or dig block"))
        })
      })
    } else {
      return new Promise(function (resolve, reject) {
        console.log("No block to dig")
        reject(new Error("No block to dig"))
      })
    }
  }

  function findBlock(username, blockType, onlyTakeTopBlocks=false, maxDistance = 30) {
    console.log("Finding block of type: " + blockType)
    let theBlock = bot.findBlock({
      point: bot.entity.position,
      matching: (block) => {
        // if nothing specified... try anything but air
        if (blockType) {
          if (block.name.toLowerCase().includes(blockType.toLowerCase())) {
            return true;
          }
          if (block.displayName.toLowerCase().includes(blockType.toLowerCase())) {
            return true;
          }
          return false;
        }
        if (block.type !== 0) {
          return true;
        }
        return false;
      },
      maxDistance: maxDistance,
      useExtraInfo: (block) => {
        if (onlyTakeTopBlocks ) {
          const blockAbove = bot.blockAt(block.position.offset(0, 1, 0))
          return !blockAbove || blockAbove.type === 0
        }
        return true;
      }
    })
    if (!theBlock) {
      console.log('I did not find any ' + blockType + ' in range: ' + maxDistance)
      if (username) {
        bot.whisper(username, 'I did not find any ' + blockType + ' in range: ' + maxDistance)
      }
    }
    return theBlock
  }

  function findAndDigBlock(username, blockType, onlyTakeTopBlocks=false, maxDistance = 30) {
    return digBlock(username, blockType, findBlock(username, blockType,onlyTakeTopBlocks, maxDistance))
  }

  function findAndAttackTarget(username, targetType) {
    // make sure the bot doesn't target us for death
    // also make sure we don't re-pick the last target on errors
    const entity = bot.nearestEntity(ne => ((!targetType || (ne.name && (ne.name.toLowerCase().includes(targetType.toLowerCase()))) || (ne.displayName && (ne.displayName.toLowerCase().includes(targetType.toLowerCase())))) && (!username || ne.username !== username) && (ne.health > 0) && (ne.type === 'mob' || ne.type === 'player')));
    if (!entity) {
      console.log('NO, There are none of ' + targetType + ' to attack')
      if (username) {
        bot.whisper(username, 'NO, There are none of ' + targetType + ' to attack')
      }
    } else {
      console.log('YES, I will attack ' + entity.displayName || entity.name)
      if (username) {
        bot.whisper(username, 'YES, I will attack ' + entity.displayName || entity.name)
      }
      let goalSet = false;
      let myInterval = setInterval(function() {
        if (keepAttacking) {
          if (entity && entity.isValid && bot.isValid && entity.health >0 && bot.entity.health >0) {

            let distance = entity.position.distanceTo(bot.entity.position)
            if (distance < 3) {
              bot.attack(entity, true);
            } else {
              if (!goalSet) {
                bot.pathfinder.setMovements(defaultMove)
                bot.pathfinder.setGoal(new GoalFollow(entity, 1), true);
                goalSet = true;
              }
            }
          } else {
            console.log('My target died ... finding a new target')
            if (username) {
              bot.whisper(username, 'My target died ... finding a new target')
            }
            bot.pathfinder.setMovements(defaultMove)
            bot.pathfinder.stop()
            bot.pathfinder.setGoal(null)
            findAndAttackTarget(username, targetType)
          }
        } else {
          clearInterval(myInterval);
        }
      },100);
    }

  }
}

exports.configureBot = configureBot
