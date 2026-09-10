import { eveChannel } from "eve/channels/eve";
import { simulatedPersona } from "../../lib/personas/simulated";

// Demo identity selection, NOT authentication. Protect the deployment itself.
export default eveChannel({ auth: [simulatedPersona] });
