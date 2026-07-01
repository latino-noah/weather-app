import Puff from './Puff';

export default function Cloud({ cloud }) {
  return (
    <div
      className="cloud"
      style={{
        width: `${cloud.width}px`,
        height: `${cloud.height}px`,
        top: `${cloud.top}px`,
        animationDuration: `${cloud.duration}s`,
        animationDelay: `${cloud.delay}s`,
        opacity: cloud.opacity,
        transform: `scale(${cloud.scale ?? 1})`
      }}
    >
      <div
        className="cloud-body"
        style={{
          animationDuration: `${cloud.bobDuration}s`,
          animationDelay: `${cloud.bobDelay}s`
        }}
      >
        <div className="cloud-glow" />
        {cloud.puffs.map((puff) => (
          <Puff
            key={puff.id}
            width={puff.width}
            height={puff.height}
            left={puff.left}
            top={puff.top}
            opacity={puff.opacity}
            blur={puff.blur}
            highlightX={puff.highlightX}
            highlightY={puff.highlightY}
          />
        ))}
        <div className="cloud-base" />
      </div>
    </div>
  );
}
