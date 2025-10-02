<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Capital Challenge Horse Show — Insider Guide</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<script src="https://cdn.tailwindcss.com"></script>
<body class="bg-white text-zinc-900">
  import { motion } from "framer-motion";
import { Calendar, MapPin, UtensilsCrossed, Coffee, BedDouble, ShoppingCart, Compass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Capital Challenge Horse Show</h1>
              <p className="mt-4 text-lg text-zinc-700 max-w-2xl">
                Upper Marlboro, Maryland • September 24 – October 5, 2025
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Badge icon={<Calendar className="h-4 w-4" />} text="Fall 2025" />
                <Badge icon={<MapPin className="h-4 w-4" />} text="Prince George Equestrian Center" />
                <Badge icon={<Compass className="h-4 w-4" />} text="Crisp 74°/54° seasonal norms" />
              </div>
            </div>
            <div className="lg:col-span-5">
              <Card className="rounded-2xl shadow-lg">
                <CardContent className="p-6">
                  <p className="text-base leading-relaxed text-zinc-800">
                    The Capital Challenge Horse Show rides into Upper Marlboro, Maryland, from September 24 to October 5, 2025. Set at the Prince George Equestrian Center, the venue blends expansive indoor arenas with a professional yet welcoming atmosphere. Just outside, the town’s crisp autumn air pairs with a lively, close-knit vibe. Average highs hover near 74°F, with evenings around 54°F. Expect hunter, jumper, and equitation spotlights, including North American Equitation Championships and the Ariat Adult Medal Finals.
                  </p>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Content Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Stay */}
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="lg:col-span-1">
            <FeatureCard title="Stay" icon={<BedDouble className="h-5 w-5" />}
              body="Premium stays cluster within easy reach of the showgrounds. MGM National Harbor anchors the luxe end. Hilton Garden Inn and Courtyard by Marriott deliver convenient comfort. Extended-stay options suit longer rotations. Reserve early to stay close and unwind after ringside days."/>
            <div className="mt-4">
              <Button className="rounded-2xl">Book early for best proximity</Button>
            </div>
          </motion.div>

          {/* Dine AM */}
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55 }} className="lg:col-span-1">
            <FeatureCard title="Dine: AM" icon={<Coffee className="h-5 w-5" />}
              body="Start at Milk & Honey or First Watch for hearty breakfasts and coffee. Grab-and-go bakery and juice stops near the venue keep energy high for early classes and long schooling blocks."/>
          </motion.div>

          {/* Dine Dinner */}
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="lg:col-span-1">
            <FeatureCard title="Dine: Dinner" icon={<UtensilsCrossed className="h-5 w-5" />}
              body="Close the day with seafood at The Walrus Oyster & Ale House in National Harbor or farm-to-table plates at Olde Towne Inn. Chesapeake crab leads the seasonal lineup. Options fit both team dinners and quiet resets."/>
            <div className="mt-4">
              <Button className="rounded-2xl">Reserve a dinner table</Button>
            </div>
          </motion.div>
        </div>

        {/* Locale and Essentials */}
        <div className="mt-8 grid lg:grid-cols-2 gap-6 lg:gap-8">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55 }}>
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-2xl font-semibold">Locale</h2>
                <p className="mt-3 text-zinc-800 leading-relaxed">
                  Reset off-barn with quick trips to Washington, D.C. Monuments, museums, and neighborhoods offer depth between rounds. Or stroll the Potomac waterfront at National Harbor for shopping and entertainment.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <Card className="rounded-2xl shadow-lg">
              <CardContent className="p-6">
                <h2 className="text-2xl font-semibold flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Essentials</h2>
                <p className="mt-3 text-zinc-800 leading-relaxed">
                  Stock basics at Giant Food and CVS. Southern States covers feed and farm needs. Car rentals are available at area hubs. Golf-cart rentals streamline in-grounds transport. Prep early to keep focus on performance.
                </p>
                <div className="mt-4">
                  <Button className="rounded-2xl">Save your essentials list</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Outro */}
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }} className="mt-10">
          <Card className="rounded-2xl shadow-lg">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold">Finish</h2>
              <p className="mt-3 text-zinc-800 leading-relaxed">
                Tradition and talent meet each fall at Capital Challenge. The blend of sport and community endures long after the final round.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </section>
    </div>
  );
}

function Badge({ icon, text }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border px-3 py-1 text-sm text-zinc-700 bg-white/60 shadow-sm">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function FeatureCard({ title, icon, body }) {
  return (
    <Card className="rounded-2xl shadow-lg h-full">
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <p className="mt-3 text-zinc-800 leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}

</body>
</html>
