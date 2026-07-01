import Cloud from './Cloud';

export default function Clouds({ clouds }) {
  return (
    <div className="clouds">
      {clouds.map((cloud) => (
        <Cloud key={cloud.id} cloud={cloud} />
      ))}
    </div>
  );
}
