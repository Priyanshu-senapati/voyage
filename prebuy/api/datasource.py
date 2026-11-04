"""Where hotel-week data comes from. Demo: the simulated world. Later: TBO's booking and search data."""

from dataclasses import dataclass
from typing import Protocol

from prebuy.sim import World, make_world


class DataSource(Protocol):
    def load(self) -> World: ...


@dataclass(frozen=True)
class DemoDataSource:
    seed: int = 7

    def load(self) -> World:
        return make_world(self.seed)
