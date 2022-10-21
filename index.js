const mineflayer  = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalNear, GoalBlock, GoalGetToBlock, GoalCompositeAny, GoalLookAtBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
const { Vec3 } = require('vec3');
const { RGMatchInfo } = require('rg-match-info');
//const mineflayerViewer = require('prismarine-viewer').mineflayer

/**
 * Mineflayer API docs - https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
 * Mineflayer Pathfinder API docs - https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/readme.md
 */
function configureBot(bot, matchInfoEmitter) {

  bot.loadPlugin(pathfinder)

  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)

  let keepAttacking = true;

  let lastFarmedType = undefined;
  let farmingInProgress = false;
  let farmingDeliveryRun = false;

  let matchInfo = null;

  /**
   * Handle match info updates
   */
  matchInfoEmitter.on('score_update', (matchInfo) => {
    console.log(`Match scores updated`)
    this.matchInfo = matchInfo;
  })

  matchInfoEmitter.on('match_started', (matchInfo) => {
    console.log(`The match has started`)
    this.matchInfo = matchInfo;
  })

  matchInfoEmitter.on('match_ended', (matchInfo) => {
    console.log(`The match has ended`)
    this.matchInfo = matchInfo;
  })

  matchInfoEmitter.on('player_joined', (matchInfo, username, team) => {
    console.log(`${username} on team: ${team} has joined the match `)
    this.matchInfo = matchInfo;
  })

  matchInfoEmitter.on('player_left', (matchInfo, username, team) => {
    console.log(`${username} on team: ${team} has left the match `)
    this.matchInfo = matchInfo;
  })

  function logAndChat(message) {
    console.log(message)
    bot.chat(message)
  }

  /**
   * When spawned, start looking for wood
   */
  bot.on('spawn', () => {
    //mineflayerViewer(bot, { viewDistance: 3, firstPerson: true, port: 33333 }) // Start the viewing server on port 3000
    farmingInProgress = true;
    farmingDeliveryRun = false;
    bot.settings.viewDistance = 'far';
    bot.pathfinder.setMovements(defaultMove)
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

  bot.on('path_reset', async (reason) => {
    console.log(`Path was reset for reason: ${reason}`)
    if ('stuck' === reason || 'place_error' === reason || 'dig_error' === reason) {
      // TODO: If still stuck after 5 ? Do we want to just respawn... b/c we're stuck stuck... or call for help / guide our player to us
      if (++stuckCount > 5) {
        stuckCount = 0;
        console.log("Stuck bot: Stopping digging and pathfinding for a sec")
        bot.stopDigging();
        bot.pathfinder.stop()
        bot.pathfinder.setGoal(null)
      }
    }
  })


  /**
   * Randomly wanders the bot minRange->maxRange X and minRange->maxRange Z from the current position
   * @returns {Promise<void>}
   */
  function wanderTheBot(minRange=10, maxRange=10) {
    if (minRange < 1) {
      minRange = 1;
    }
    if (maxRange < minRange) {
      maxRange = minRange;
    }
    let xRange = (minRange + (Math.random()*(maxRange-minRange))) * (Math.random() < 0.5 ? -1 : 1);
    let zRange = (minRange + (Math.random()*(maxRange-minRange))) * (Math.random() < 0.5 ? -1 : 1);
    let newX = bot.entity.position.x + xRange;
    let newZ = bot.entity.position.z + zRange;
    return bot.pathfinder.goto(new GoalXZ(newX, newZ))
  }

  /**
   * sample for equipping items that get picked up
   */
  bot.inventory.on('windowUpdate', function(collector, collected) {
    if(collector.type === 'player' && collected.type === 'object' && collector.username == bot.username) {
      let rawItem = collected.metadata[10];
      try {
        let item = mineflayer.Item.fromNotch(rawItem);
        if (item.name == "iron_helmet") {
          bot.equip(item.type, "head");
        } else if (item.name == "leather_helmet") {
          bot.equip(item.type, "head");
        }
      } catch (err) {

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

  async function handleChatOrWhisper(username, message) {
    if (username === bot.username || username === 'you') return

    if (message === 'reinit') {
      bot.end()
    } else if (message === 'hardstop') {
      logAndChat('YES, I will hard stop')
      hardStopBot()
    } else if (message === 'stop') {
      logAndChat('YES, I will stop')
      stopBot()
    } else if (message.startsWith('come')) {
      const cmd = message.split(' ')
      let range = undefined;
      if (cmd.length >= 2) { // goto x y z
        range = cmd[1]
      }
      let entity = findPlayerEntity(username)
      if (range) {
        gotoEntity(entity, range).catch((err) => {
          console.error("Couldn't find: " + username + " in range: " + range, err)
        })
      } else {
        gotoEntity(entity).catch((err) => {
          console.error("Couldn't find: " + username, err)
        })
      }
    } else if (message.startsWith('follow')) {
      const cmd = message.split(' ')
      let range = undefined;
      if (cmd.length >= 2) { // goto x y z
        range = parseInt(cmd[1], 10)
        console.log('range: ' + range)
      }
      let entity = findPlayerEntity(username)
      if (range) {
        followEntity(entity, range)
      } else {
        followEntity(entity)
      }
    } else if (message.startsWith('avoid')) {
      const cmd = message.split(' ')
      let range = undefined;
      if (cmd.length >= 2) { // goto x y z
        range = parseInt(cmd[1], 10)
        console.log('range: ' + range)
      }
      let entity = findPlayerEntity(username)
      if (range) {
        avoidEntity(entity, range)
      } else {
        avoidEntity(entity)
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
        dropInventoryItem(dropThing, dropQuantity).catch((err) => {
          console.error("Couldn't drop item: " + dropThing, err)
        })
      } else {
        dropInventoryItem(dropThing).catch((err) => {
          console.error("Couldn't drop item: " + dropThing, err)
        })
      }
    } else if (message.startsWith('dig')) {
      stopBot()
      const cmd = message.split(' ')
      let blockType = undefined;
      if (cmd.length >= 2) { // goto x y z
        blockType = cmd[1]
      }
      findAndDigBlock(blockType).catch((err) => {
        console.error("Couldn't dig blockType: " + blockType, err)
      })
    } else if (message.startsWith('attack')) {
      stopBot()
      keepAttacking = true;
      const cmd = message.split(' ')
      let targetType = undefined;
      if (cmd.length >= 2) {
        targetType = cmd[1]
      }
      attackRoutine(targetType)
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

  function hardStopBot() {
    bot.stopDigging();
    bot.pathfinder.stop()
    bot.pathfinder.setGoal(null)

    // kill all timers... this is a javascript trick to be able to find all outstanding timer intervals and clear all of them. this prevents you having
    // a situation where you say... told the farmer to run again in N ms, but you said stop before that.. this will prevent that timer from every happening
    var killId = setTimeout(function() {
      for (var i = killId; i > 0; i--) clearInterval(i)
    }, 10);

    keepAttacking = false;
    lastFarmedType = undefined;
    farmingInProgress = false;
    farmingDeliveryRun = false;
  }

  function stopBot() {

    bot.stopDigging();
    bot.pathfinder.stop()
    bot.pathfinder.setGoal(null)
    keepAttacking = false;
    lastFarmedType = undefined;
    farmingInProgress = false;
    farmingDeliveryRun = false;
  }

  /**
   * Main loop for a itemType farming routine that will deliver itemType to a player every deliveryThreshold collected
   * @param itemType
   * @param deliveryThreshold
   */
  async function farmerRoutine(itemType, deliveryThreshold = 10, failureCount = 0) {
    console.log(`Farmer (${failureCount}): farmingInProgress=${farmingInProgress}, itemType: ${itemType}`)
    if (farmingInProgress) {
      // do a delivery run
      if (farmingDeliveryRun) {
        console.log(`Farmer (${failureCount}): DeliveryRun: Finding a player to deliver to`)
        // find a target player
        const target = Object.entries(bot.players).find((pair) => {
          console.log(`Farmer (${failureCount}): Checking Entity: ` + pair[0] + " , " + pair[1].entity?.username)
          // TODO: Need to be able to detect that this is a Human, not another bot
          if (pair[1].entity && pair[1].entity?.username && pair[0] !== bot.entity.username) {
            console.log(`Farmer (${failureCount}): Found Entity`)
            return true;
          }
          return false;
        })
        if (target) {
          console.log(`Farmer (${failureCount}):  DeliveryRun: Trying to deliver ${itemType} to: ${target[1].entity.username}`)
          try {
            await gotoEntity(target[1].entity, 3)
            await bot.lookAt(target[1].entity.position).catch((err) => {
              console.error(`Farmer (${failureCount}): Failed to look at player position`, err)
            })
            await dropInventoryItem(itemType)
            console.log(`Farmer (${failureCount}):  DeliveryRun: Made a delivery to: ${target[1].entity.username}... going back to farming`)
            farmingDeliveryRun = false;
          } catch(err) {
            if (failureCount < 20) {
              console.error(`Farmer (${failureCount}):  DeliveryRun: Didn't make it to my delivery target, trying again soon`, err)
              farmerRoutine(itemType, deliveryThreshold, failureCount + 1)
              return
            } else {
              console.error(`Farmer (${failureCount}):  DeliveryRun: No target player available for delivery after 20 tries... going back to farming`, err)
              farmingDeliveryRun = false;
            }
          }
        } else {
          console.log(`Farmer (${failureCount}):  DeliveryRun: No player available for delivery.. going back to farming`)
          farmingDeliveryRun = false;
        }
      }

      // cut more
      if (!farmingDeliveryRun) {
        try {
          await findAndDigBlock(itemType, false, 50)
          console.log(`Farmer (${failureCount}):  Dug a ` + itemType)
          lastFarmedType = itemType;
          let itemOnGround = findItemInRange(itemType, 7)
          if (itemOnGround) {
            await pickupItem(itemOnGround).catch ((err) => {
              console.error(`Farmer (${failureCount}): Failed to pickup item`, err)
            })
          }
          let quantityAvailable = 0;
          bot.inventory.items().filter((item) => {
            let isAxe = itemType.toLowerCase().includes('axe');
            let itemNameMatches = (item.name && item.name.toLowerCase().includes(itemType.toLowerCase()) && (isAxe || !item.name.toLowerCase().includes('axe')));
            let displayNameMatches = (item.displayName && item.displayName.toLowerCase().includes(itemType.toLowerCase()) && (isAxe || !item.displayName.toLowerCase().includes('axe')));
            if (itemNameMatches || displayNameMatches) {
              quantityAvailable += item.count
              return true;
            }
            return false;
          })
          if (quantityAvailable >= deliveryThreshold) {
            console.log(`Farmer (${failureCount}):  Scheduling a delivery run for ` + quantityAvailable + " " + itemType)
            farmingDeliveryRun = true;
          } else {
            console.log(`Farmer (${failureCount}):  I have ` + quantityAvailable + " / " + deliveryThreshold + " " + itemType + " needed for a delivery")
          }
          farmerRoutine(itemType, deliveryThreshold)
          return
        } catch(err) {
          if (failureCount < 50) {
            console.error(`Farmer (${failureCount}):  No ` + itemType + " found, wandering the bot before resuming farming", err)
            try {
              await wanderTheBot(5*(failureCount), 20+(failureCount)*5)
              console.log(`Farmer (${failureCount}):  Finished wandering... retrying farming`)
              farmerRoutine(itemType, deliveryThreshold)
              return
            } catch (err) {
              console.error(`Farmer (${failureCount}):  Error while trying to wander the bot to farm again`, err)
              farmerRoutine(itemType, deliveryThreshold, failureCount + 1)
              return
            }
          } else {
            console.error(`Farmer (${failureCount}):  No ` + itemType + " found after 20 tries... stopping farming routine completely")
            farmingInProgress = false
          }
        }
      }
      console.log(`Farmer (${failureCount}): Farming Routine Pass Ended`)
    }
  }

  function itemEntityName(entity) {
    let theItem = mcData.items[entity.metadata[8].itemId]
    return theItem.displayName || theItem.name
  }

  function findItemInRange(itemName, range= 30) {
    logAndChat("Looking for item " + itemName + " in range " + range)
    return bot.nearestEntity((entity) => {
      if( entity.type === "object" && entity.objectType === "Item" && entity.onGround) {
        let matchedName = true;
        try {
          // Understanding entity metadata ... https://wiki.vg/Entity_metadata#Entity_Metadata_Format
          // since this is an item entity, we can parse the item data from field index 8
          let theItemName = itemEntityName(entity)
          console.log("Evaluating: " + theItemName + " - id: " + entity.id + " at (" + entity.position.x + "," + entity.position.y + "," + entity.position.z + ") - metadata: " + JSON.stringify(entity.metadata[8]))
          if (!(!itemName || itemName.toLowerCase().contains(theItemName.toLowerCase()))) {
            matchedName = false
          }
        } catch (err) {
          console.error(`Couldn't convert item from notch data: ${err.message}`)
        }
        if (matchedName && bot.entity.position.distanceTo(entity.position) < range) {
          console.log("Found " + (entity.displayName || entity.name))
          return entity;
        }
      }
      return undefined;
    })
  }

  /**
   * This will goto and pickup the item
   *
   * @param item
   * @param range
   */
  async function pickupItem(item) {
    if (item) {
      logAndChat('Going to pickup item - ' + itemEntityName(item))
      await bot.pathfinder.goto(new GoalBlock(item.position.x, item.position.y, item.position.z))
    } else {
      logAndChat('No Item to pickup')
    }
  }

  /**
   * This will drop up to the quantity requested of any inventory item matching the itemName.  So if you request to drop 'log', any type of log would be dropped to fulfill this request.
   * Note: -1 for quantity means to drop ALL of them, which is the default
   *
   * @param itemName
   * @param quantity
   */
  async function dropInventoryItem(itemName, quantity= -1) {
    let quantityAvailable = 0;
    let itemsToDrop = bot.inventory.items().filter((item) => {
      // don't drop an 'axe' unless it has explicitly requested... this prevents the bot from dropping stone tools when dropping stone
      let isAxe = itemName.toLowerCase().includes('axe');
      let itemNameMatches = (item.name && item.name.toLowerCase().includes(itemName.toLowerCase()) && (isAxe || !item.name.toLowerCase().includes('axe')));
      let displayNameMatches = (item.displayName && item.displayName.toLowerCase().includes(itemName.toLowerCase()) && (isAxe || !item.displayName.toLowerCase().includes('axe')));
      if(itemNameMatches || displayNameMatches) {
        quantityAvailable += item.count
        return true;
      }
      return false;
    })
    if (quantityAvailable > 0) {
      let quantityToDrop = (quantity<0?quantityAvailable:quantity);
      logAndChat('YES, I will drop ' + quantityToDrop + ' ' + itemName)
      try {
        let i = 0;
        while (quantityToDrop > 0 && i < itemsToDrop.length) {
          let theItem = itemsToDrop[i];
          let qty = (theItem.count > quantityToDrop ? quantityToDrop : theItem.count);
          await bot.toss(theItem.type, theItem.metadata, qty)
          quantityToDrop -= qty;
          ++i;
        }

      } catch (err) {
        console.error(`I had an error dropping ${itemName}`, err)
      }
    }
    else {
      logAndChat(`NO, I don't have any ${itemName} to drop`)
    }
  }

  function findPlayerEntity(username) {
    return bot.players[username] ? bot.players[username].entity : null
  }

  async function gotoEntity(entity, range = 1) {
    if (!entity) {
      logAndChat(`I don't see: ${(entity.displayName || entity.name)}`)
    } else {
      logAndChat(`YES, I will come to range: ${range} away from: ${(entity.displayName || entity.name)}`)
      await bot.pathfinder.goto(new GoalNear(entity.position.x, entity.position.y, entity.position.z, range))
    }
  }

  async function followEntity(entity, range = 2) {
    if (!entity) {
      logAndChat(`I don't see: ${(entity.displayName || entity.name)}`)
    } else {
      logAndChat(`YES, I will follow at range: ${range} away from: ${(entity.displayName || entity.name)}`)
      bot.pathfinder.setGoal(new GoalFollow(entity, range), true)
    }
  }

  async function avoidEntity(entity, range= 5) {
    if (!entity) {
      logAndChat(`I don't see: ${(entity.displayName || entity.name)}`)
    } else {
      logAndChat(`YES, I will follow at range: ${range} away from: ${(entity.displayName || entity.name)}`)
      bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(entity, range)), true)
    }
  }

  function positionString(position) {
    return `${position.x}, ${position.y}, ${position.z}`
  }

  function findBlock(blockType, onlyFindTopBlocks=false, range = 50) {
    console.log(`Finding block of type: ${blockType} in range: ${range}`)
    let theBlocks = bot.findBlocks({
      point: bot.entity.position,
      matching: (block) => {
        if (blockType) {
          if ((block.name.toLowerCase().includes(blockType.toLowerCase())) || (block.displayName.toLowerCase().includes(blockType.toLowerCase())) ) {
            return true;
          }
          return false;
        }
        if (block.type !== 0) {
          // if nothing specified... try anything but air
          return true;
        }
        return false;
      },
      maxDistance: range,
      useExtraInfo: (block) => {
        if (onlyFindTopBlocks ) {
          const blockAbove = bot.blockAt(block.position.offset(0, 1, 0))
          return !blockAbove || blockAbove.type === 0 // only find if clear or 'air' above
        }
        return true;
      },
      count: 1, // return up to 1 options...
    })

    let theBlock = theBlocks.length > 0 ? bot.blockAt(theBlocks[0]):null;
    if (!theBlock) {
      logAndChat(`I did not find any block of type: ${blockType} in range: ${range}`)
    }
    return theBlock
  }

  async function gotoBlock(theBlock, range = 4.5) {
    try {
      logAndChat(`YES, I will goto within range: ${range} of ${positionString(theBlock.position)}`)
      await bot.pathfinder.goto(new GoalLookAtBlock(theBlock.position, bot.world, {reach: range}))
    } catch (err) {
      console.error('Error going to a block', err)
    }
  }

  async function digBlock(theBlock) {
    if (theBlock) {
      try {
        const blockName = theBlock.displayName || theBlock.name;
        logAndChat(`YES, I will dig - ${blockName}`)
        const bestHarvestTool = bot.pathfinder.bestHarvestTool(theBlock)
        if (bestHarvestTool) {
          await bot.equip(bestHarvestTool, 'hand').catch((err) => {
            console.error('Unable to equip a better tool', err)
          })
        }
        await bot.dig(theBlock)
        logAndChat('I dug up a ' + blockName)
      } catch (err) {
        console.error('Error digging a block', err)
      }
    }
  }

  async function findAndDigBlock(blockType, onlyFindTopBlocks=false, maxDistance = 50) {
    let theBlock = findBlock(blockType, onlyFindTopBlocks, maxDistance)
    await gotoBlock(theBlock)
    await digBlock(theBlock)
  }

  function findAttackableEntity(targetType) {
    return bot.nearestEntity(ne => {
      if( !targetType || (ne.name && (ne.name.toLowerCase().includes(targetType.toLowerCase()))) || (ne.displayName && (ne.displayName.toLowerCase().includes(targetType.toLowerCase())))) {
        logAndChat(`Evaluating attack target: ${(ne.displayName || ne.name)} , isValid: ${ne.isValid} , health: ${ne.health} , isMobOrPlayer: ${(ne.type === 'mob' || ne.type === 'player')}`)
        return (ne.isValid && (ne.type === 'mob' || ne.type === 'player'))
      }
      return false
    });
  }

  async function attackEntity(entity) {
    if (!entity) {
      logAndChat('NO, There is no target to attack')
    } else {
      try {
        bot.attack(entity, true);
      } catch(err) {
        console.log(`Error attacking target: ${(entity.displayName || entity.name)}`, err)
      }
    }
  }

  async function attackRoutine(targetType) {
    let entity = findAttackableEntity(targetType)
    await gotoEntity(entity, 2)
    await attackEntity(entity)
    if (keepAttacking) {
      attackRoutine(targetType)
    }
  }

}

exports.configureBot = configureBot
