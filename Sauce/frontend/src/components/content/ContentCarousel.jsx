import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/carousel";
import { ContentCard } from "./ContentCard";

export function ContentCarousel({ items = [], onBuy }) {
  if (items.length === 0) return null;

  return (
    <Carousel className="w-full">
      <CarouselContent>
        {items.map((item) => (
          <CarouselItem
            key={item.id}
            className="basis-3/4 md:basis-1/2 lg:basis-1/3"
          >
            <ContentCard item={item} onBuy={onBuy} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
