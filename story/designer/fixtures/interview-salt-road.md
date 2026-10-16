# Fixture: a designer interview (fictional book, "The Salt Road")

This transcript is invented for testing. Its pack is `salt-road.pack.json`, and
`story/tools/test_story_tools.py` checks that the pack passes the gate, covers every axis, and
takes every table and column name from the author's own turns.

## Axis: premise

Designer: Before I ask anything — I see the project has three chapters and no outline. I've read them. In a sentence or two, what is this book about?

Author: A salt trader's apprentice, Ilse Varro, works her way up a merchant guild on a desert trade road. It's progression fantasy, but the progression is money and reputation, not fighting.

Designer: Invented, I take it, not drawn from real people?

Author: Invented. Loosely inspired by Saharan salt caravans but nothing real.

Designer: What have you already lost track of, or had to go back and look up?

Author: How much coin Ilse has. I printed it in the guild ledger at the end of chapter one and I already can't remember if chapter three matches. Also who holds which wares — she sold a sack of rock salt and I forgot to whom.

## Axis: shape

Designer: Who does the book follow? Is anyone more than one person — a family, a crew, a faction?

Author: Ilse, her master Bram Okafor, and a rival, Teodor Hask. The guilds act as single players. There's the Lantern Guild, which Ilse is in, and the Tidemark Combine.

Designer: So Guilds would be a table of their own. Are there things that matter enough to keep — goods, documents?

Author: The wares. Every ware has an origin and a price, some are contraband, and I need to know who each one is held by at any point.

Designer: Can people have or learn abilities?

Author: Knacks. Appraisal is the first one Ilse learns. Each knack has a cost — you have to pay the guild to be taught it — and a rank.

Designer: Do any places have rules of their own?

Author: Each oasis town charges a toll. That's it.

Designer: An idea, only an idea: some books like this track stamina for the caravan. Does yours?

Author: No, I don't want that.

## Axis: arc

Designer: Where does Ilse start — what does she have, lack, owe or believe?

Author: Twelve silver, the lowest guild rank, sworn to the Lantern Guild through Bram. She believes the guild is fair.

Designer: Where does she end up?

Author: Rank five, rich, and sworn to the Tidemark Combine instead. She leaves the Lantern Guild.

Designer: What does each gain cost her?

Author: Favour. Every time she cuts a hard deal she loses favour with somebody.

Designer: Which rules must never break? For each: how does it work, what does it cost, and where does it stop?

Author: The salt oath. When you swear to a guild you can only sell salt through that guild. Breaking it costs you your rank, all of it. And it only covers salt, not other wares.

## Axis: change

Designer: As the chapters go by, what changes?

Author: Her coin, her favour, her guild rank, who she's sworn to, and who holds the wares.

Designer: Which of those are numbers, and can they go down? Any floor or ceiling?

Author: Coin can't go below zero. Favour can go negative, down to minus ten, and caps at ten. Guild rank never goes down — ranks are never taken away, except by the salt oath. There are seven ranks.

Designer: Breaking the oath takes the rank away, though. Should guild rank be allowed to fall, or is the oath the only exception you'll handle by hand?

Author: Leave it as never going down. If the oath breaks I'll deal with it myself.

Designer: Does the page ever print these numbers?

Author: The guild ledger at the end of each chapter prints her coin.

Designer: Are any changes temporary or conditional?

Author: In chapter four she gets a Lantern writ that adds favour, but only while she carries it.

Designer: I'll log that one with its condition when chapter four is written. What are the starting values?

Author: Ilse: twelve coin, favour zero, guild rank one. Bram has forty coin.

## Axis: naming

Designer: Here's what I have, in your words. Characters gain Guild Rank, Coin, Favour, Sworn To and Debts. A Guilds table with Seat and Wants. Wares with Origin, Price, Held By and Contraband. Knacks with Cost and Rank. Locations gain Toll. Rules: the salt oath. Anything to rename, merge or drop?

Author: That's right. Each guild has a seat, the city it's run from, and wants. Bram has debts I'll fill in later.

Designer: What units do the numbers use?

Author: Silver for coin, price and toll.

Designer: Which one or two things about a person should the AI never forget, even when they only pass through a scene?

Author: Guild rank and who they're sworn to.

Designer: Is there anything it should know but not keep bringing up?

Author: Debts. Only when the scene is about money owed.

Designer: Ready for me to make these tables? You can rename, hide or add columns later in the grid.

Author: Yes.
