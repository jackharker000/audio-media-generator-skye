import { features } from "@/lib/env";
import { requireUserPage } from "@/server/pageAuth";
import {
  friendsFeed,
  listFriends,
  listIncoming,
  listOutgoing,
} from "@/server/friends";
import { FriendsClient } from "@/components/FriendsClient";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  if (!features.hasDb()) return <SetupNotice />;
  const userId = await requireUserPage();
  const [friends, incoming, outgoing, feed] = await Promise.all([
    listFriends(userId),
    listIncoming(userId),
    listOutgoing(userId),
    friendsFeed(userId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Friends</h1>
      <FriendsClient
        friends={friends}
        incoming={incoming}
        outgoing={outgoing}
        feed={feed.map((item) => ({
          id: item.song.id,
          title: item.song.title,
          genre: item.song.params?.genre ?? null,
          visibility: item.song.visibility ?? null,
          createdAt: item.song.createdAt,
          owner: { name: item.owner.name, email: item.owner.email },
        }))}
      />
    </div>
  );
}
