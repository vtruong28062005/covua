const { useState, useEffect } = React;

function FloatingEmojisMap({ onSendEmote }) {
  const emojisList = ['😛', '🤣', '😭', '😡', '🔥', '👏', '🥶', '🤡'];
  const EMOJI_SIZE = 40;
  
  const [emojisPosition, setEmojisPosition] = useState(
    emojisList.map((emoji) => ({
      emoji,
      id: emoji,
      top: 0,
      left: 0,
      transitionDuration: 1000,
    }))
  );

  useEffect(() => {
    const getRandomPosition = () => {
      const maxTop = window.innerHeight - EMOJI_SIZE;
      const maxLeft = window.innerWidth - EMOJI_SIZE;
      return {
        top: Math.random() * maxTop,
        left: Math.random() * maxLeft,
      };
    };

    const intervalsRef = [];

    emojisPosition.forEach((item, index) => {
      const randomInterval = Math.random() * 2000 + 1500; 

      const intervalId = setInterval(() => {
        setEmojisPosition((prev) => {
          const newPositions = [...prev];
          const newPos = getRandomPosition();
          newPositions[index] = {
            ...newPositions[index],
            ...newPos,
            transitionDuration: randomInterval,
          };
          return newPositions;
        });
      }, randomInterval);

      intervalsRef.push(intervalId);
    });

    return () => {
      intervalsRef.forEach((id) => clearInterval(id));
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {emojisPosition.map((item) => (
        <button
          key={item.id}
          onClick={() => onSendEmote(item.emoji)}
          className="absolute text-3xl hover:scale-125 transition-all ease-in-out pointer-events-auto"
          style={{
            top: `${item.top}px`,
            left: `${item.left}px`,
            transitionDuration: `${item.transitionDuration}ms`,
            transform: 'translate(-50%, -50%)',
          }}
          title={item.emoji}
        >
          {item.emoji}
        </button>
      ))}
    </div>
  );
}
