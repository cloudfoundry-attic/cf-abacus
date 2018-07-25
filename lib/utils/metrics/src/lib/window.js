'use strict';

class Window {
  constructor(duration) {
    this.duration = duration;
    this.currentSlotIndex = 0;
  }

  update(currentTime) {
    const currentIndex = Math.floor(currentTime / this.duration);
    const isCurrentSlot = currentIndex == this.currentSlotIndex;

    if (!isCurrentSlot) {
      const isNextSlot = currentIndex == this.currentSlotIndex + 1;

      if (isNextSlot)
        this.shift();
      else
        this.resetPrevious();

      this.resetCurrent();
      this.currentSlotIndex = currentIndex;
    }
  }
};

module.exports = {
  Window
};
